
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';
import { I18N, TAROT_DECK, STELLAR_ENGINE } from '../constants';
import { ReadingData, TarotCard, MODES } from '../types';

const createCircleTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
  gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
};

const createNebulaTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.05)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
};

const CoreShader = {
  uniforms: {
    time: { value: 0 },
    colorYellow: { value: new THREE.Color(0xFFDD44) }, 
    colorWhite: { value: new THREE.Color(0xFFFFFF) },  
    flareIntensity: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vPosition;
    void main() {
      vUv = uv;
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vPosition;
    uniform float time;
    uniform vec3 colorYellow;
    uniform vec3 colorWhite;
    uniform float flareIntensity;
    void main() {
      float wave = sin(vPosition.x * 10.0 + time * 2.5) * 
                   cos(vPosition.y * 10.0 - time * 2.0) * 
                   sin(vPosition.z * 10.0 + time * 1.5);
      vec3 color = mix(colorYellow, colorWhite, wave * 0.4 + 0.5);
      float intensity = 1.2 + 0.8 * sin(time * 4.0) + flareIntensity * 4.0;
      gl_FragColor = vec4(color * intensity, 1.0);
    }
  `
};

const GalacticTarot: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null); 
  const videoRef = useRef<HTMLVideoElement>(null);     
  const [lang, setLang] = useState<'en' | 'cn'>('cn'); 
  const [status, setStatus] = useState("");              
  const [gestureHint, setGestureHint] = useState("");   
  const [isCamActive, setIsCamActive] = useState(false); 
  const [reading, setReading] = useState<ReadingData | null>(null); 
  const [isPreloaded, setIsPreloaded] = useState(false); 
  const [showHelp, setShowHelp] = useState(false);

  // 性能与稳定性：将 UI 状态与 3D 循环完全解耦
  const langRef = useRef(lang);
  const tRef = useRef(I18N[lang]);
  useEffect(() => { 
    langRef.current = lang;
    tRef.current = I18N[lang];
  }, [lang]);

  const [menuPos, setMenuPos] = useState({ x: 80, y: 80 });
  const [isMenuDragging, setIsMenuDragging] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [trail, setTrail] = useState<{ x: number, y: number, id: number }[]>([]);
  const trailIdCounter = useRef(0);

  const particleCount = 15000;
  const particleSizeScale = 0.6; 
  const coreColor = "#FFCC00";
  const galaxyColor = "#4466FF";
  const nebulaIntensity = 0.15;
  const accretionSpeed = 1.8;
  const flareFreq = 0.4;
  
  const modeRef = useRef<number>(MODES.GALAXY);
  const rotY = useRef<number>(0);
  const rotX = useRef<number>(0);
  const rotYSpeed = useRef<number>(0.002);
  const rotXSpeed = useRef<number>(0);
  
  const drawStartTime = useRef<number>(0);
  const isFetching = useRef<boolean>(false);
  const isPointerDown = useRef<boolean>(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const coreRef = useRef<THREE.Group | null>(null);
  const coreMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const galaxyPointsRef = useRef<THREE.Points | null>(null);
  const nebulaGroupRef = useRef<THREE.Group | null>(null);
  const mainParticleDataRef = useRef<any[]>([]);
  const coreLightRef = useRef<THREE.PointLight | null>(null);

  const stopSensors = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCamActive(false);
    setGestureHint(tRef.current.hintReady);
  }, []);

  const handleDismiss = useCallback(() => {
    setReading(null);
    modeRef.current = MODES.GALAXY;
    setGestureHint(tRef.current.hintReady);
    setStatus(tRef.current.statusReady);
    stopSensors();
  }, [stopSensors]);

  const fetchReading = useCallback(async (card: TarotCard) => {
    if (isFetching.current) return;
    isFetching.current = true;
    const t = tRef.current;
    setStatus(t.statusReading);
    modeRef.current = MODES.DRAWING;
    drawStartTime.current = performance.now() * 0.001;

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const currentLang = langRef.current;
      const localizedDeck = currentLang === 'cn' ? STELLAR_ENGINE.cn : STELLAR_ENGINE.en;
      const result = localizedDeck[card.id] || localizedDeck["fool"];
      setReading({
        cardName: currentLang === 'cn' ? card.cn : card.en,
        ...result
      });
      modeRef.current = MODES.CARD;
      setStatus(t.statusDone);
    } catch (e) {
      setStatus("Flux Interference");
      handleDismiss();
    } finally {
      isFetching.current = false;
    }
  }, [handleDismiss]);

  const fetchReadingRef = useRef(fetchReading);
  const handleDismissRef = useRef(handleDismiss);
  useEffect(() => {
    fetchReadingRef.current = fetchReading;
    handleDismissRef.current = handleDismiss;
  }, [fetchReading, handleDismiss]);

  const setupM31Galaxy = useCallback(() => {
    if (!sceneRef.current) return;
    
    if (galaxyPointsRef.current) sceneRef.current.remove(galaxyPointsRef.current);
    if (nebulaGroupRef.current) sceneRef.current.remove(nebulaGroupRef.current);

    const geo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    const colorArray = new Float32Array(particleCount * 3);
    const sizeArray = new Float32Array(particleCount);
    const particleData: any[] = [];
    const cardPoints: THREE.Vector3[] = [];
    for(let y = 0; y < 45; y++) {
      for(let x = 0; x < 40; x++) cardPoints.push(new THREE.Vector3((x - 19.5) * 1.1, (y - 22) * 1.1, 0));
    }

    const starTexture = createCircleTexture();
    const nebulaTexture = createNebulaTexture();
    const nebulaGroup = new THREE.Group();
    nebulaGroupRef.current = nebulaGroup;

    const cCore = new THREE.Color(coreColor);
    const cGalaxy = new THREE.Color(galaxyColor);

    for (let i = 0; i < particleCount; i++) {
      let t_pos = Math.random();
      if (t_pos < 0.12 && Math.random() < 0.4) t_pos = 0.12 + Math.random() * 0.88;
      const dist = 5 + t_pos * 160; 
      const angle = t_pos * Math.PI * 5.2 + (i % 2 === 0 ? 0 : Math.PI);
      
      let spiralX, spiralZ;
      if (t_pos < 0.15) {
        const hexSideAngle = (Math.PI / 3);
        const hexOffset = (Math.PI / 6);
        const localAngle = angle % hexSideAngle - hexOffset;
        const hexSideIndex = Math.floor(angle / hexSideAngle);
        const sideStretch = 0.88 + (Math.sin(hexSideIndex * 4.2) * 0.5 + 0.5) * 0.25;
        const hexFactor = 1.0 / Math.cos(localAngle);
        const radialJitter = 0.96 + Math.random() * 0.08;
        const finalR = dist * hexFactor * sideStretch * radialJitter;
        spiralX = Math.cos(angle) * finalR;
        spiralZ = Math.sin(angle) * finalR * 0.55; 
      } else {
        spiralX = Math.cos(angle) * dist;
        spiralZ = Math.sin(angle) * dist * 0.48; 
      }

      const gPos = new THREE.Vector3(
        spiralX + (Math.random()-0.5)*dist*0.2, 
        (Math.random()-0.5)*18*(1-t_pos), 
        spiralZ + (Math.random()-0.5)*dist*0.2
      );

      let baseSize = 0;
      const isBeaconStar = Math.random() < 0.07;
      if (isBeaconStar) baseSize = 2.0 + Math.random() * 5.0; 
      else {
        if (t_pos < 0.15) baseSize = 0.6 + Math.pow(Math.random(), 2.8) * 3.0;
        else if (t_pos < 0.5) baseSize = 0.3 + Math.pow(Math.random(), 3.5) * 2.0;
        else baseSize = 0.2 + Math.pow(Math.random(), 4) * 1.8;
      }

      particleData.push({
        curr: gPos.clone().multiplyScalar(1.05),
        gPos, 
        cPos: i < cardPoints.length ? cardPoints[i] : gPos.clone().multiplyScalar(6.5), 
        flyPos: new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, 450), 
        seed: Math.random() * 300, 
        mass: 0.15 + Math.random() * 0.85, 
        distRatio: t_pos,
        isMessenger: i < 500,
        baseSize: baseSize
      });

      const color = new THREE.Color();
      if (isBeaconStar) color.copy(cCore).lerp(new THREE.Color(0xffffff), Math.random() * 0.7);
      else {
        if (t_pos < 0.15) color.copy(cCore).lerp(new THREE.Color(0xffffff), Math.random() * 0.4);
        else if (t_pos < 0.5) color.set(0x9900ff).offsetHSL(Math.random() * 0.1 - 0.05, 0.2, Math.random() * 0.2 - 0.1);
        else color.copy(cGalaxy).offsetHSL(Math.random() * 0.12 - 0.06, -0.1, Math.random() * 0.25 - 0.12);
      }
      color.toArray(colorArray, i * 3);
      sizeArray[i] = baseSize * particleSizeScale;

      if (nebulaTexture && i % 400 === 0 && i < 15000) {
        const opacity = 0.06 * (nebulaIntensity / 0.15);
        const nebulaMat = new THREE.SpriteMaterial({
          map: nebulaTexture,
          color: color.clone().offsetHSL(Math.random() * 0.2 - 0.1, 0.1, 0).multiplyScalar(0.8),
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        const nebulaSprite = new THREE.Sprite(nebulaMat);
        nebulaSprite.position.copy(gPos);
        const nebulaSize = 40 + Math.random() * 60;
        nebulaSprite.scale.setScalar(nebulaSize);
        (nebulaSprite as any).baseOpacity = opacity;
        (nebulaSprite as any).baseScale = nebulaSize;
        nebulaGroup.add(nebulaSprite);
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizeArray, 1));
    
    const customMat = new THREE.ShaderMaterial({
      uniforms: { pointTexture: { value: starTexture } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (350.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
          gl_FragColor = vec4(vColor, 1.0) * texture2D(pointTexture, gl_PointCoord);
          if (gl_FragColor.a < 0.1) discard;
        }
      `,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      vertexColors: true
    });

    const points = new THREE.Points(geo, customMat);
    sceneRef.current.add(points);
    sceneRef.current.add(nebulaGroup);
    galaxyPointsRef.current = points;
    mainParticleDataRef.current = particleData;
  }, [particleCount, coreColor, galaxyColor, nebulaIntensity, particleSizeScale]);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005); 
    sceneRef.current = scene;
    
    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 1, 8000);
    camera.position.set(0, 65, 260);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.2, 0.5, 0.1);
    composer.addPass(bloom);
    composerRef.current = composer;

    const pLight = new THREE.PointLight(new THREE.Color(coreColor), 600, 450);
    scene.add(pLight);
    coreLightRef.current = pLight;

    const coreGroup = new THREE.Group();
    const coreMat = new THREE.ShaderMaterial({ 
      uniforms: THREE.UniformsUtils.clone(CoreShader.uniforms), 
      vertexShader: CoreShader.vertexShader, 
      fragmentShader: CoreShader.fragmentShader, 
      transparent: true 
    });
    coreMatRef.current = coreMat;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 32), coreMat);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(5.8, 32, 32), 
      new THREE.MeshBasicMaterial({ 
        color: new THREE.Color(coreColor), 
        transparent: true, 
        opacity: 0.38, 
        blending: THREE.AdditiveBlending 
      })
    );
    coreGroup.add(mesh, glow);
    scene.add(coreGroup);
    coreRef.current = coreGroup;

    setupM31Galaxy();

    let animationFrameId: number;
    let recognizer: GestureRecognizer | null = null;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const time = performance.now() * 0.001;
      
      const flareVal = Math.max(0, Math.sin(time * flareFreq * 12) - 0.75) * 4;
      if (coreMatRef.current) {
        coreMatRef.current.uniforms.time.value = time;
        coreMatRef.current.uniforms.flareIntensity.value = flareVal;
      }
      if (coreLightRef.current) {
        coreLightRef.current.intensity = 600 + flareVal * 1500;
      }

      if (recognizer && videoRef.current?.readyState >= 2) {
        if (Math.floor(time * 30) % 3 === 0) {
          try {
            const res = recognizer.recognizeForVideo(videoRef.current, Date.now());
            if (res && res.gestures && res.gestures.length > 0) {
              const name = res.gestures[0][0].categoryName;
              const lm = res.landmarks[0];
              if (name === "Open_Palm") { 
                rotYSpeed.current = THREE.MathUtils.lerp(rotYSpeed.current, (lm[8].x - 0.5) * -0.18, 0.06);
                setGestureHint(tRef.current.hintPalm); 
              } else if (name === "Victory") { 
                handleDismissRef.current(); setGestureHint(tRef.current.hintVictory); 
              } else if (lm[4] && lm[8] && Math.hypot(lm[4].x-lm[8].x, lm[4].y-lm[8].y) < 0.038) {
                if (modeRef.current === MODES.GALAXY && !isFetching.current) {
                  fetchReadingRef.current(TAROT_DECK[Math.floor(Math.random()*TAROT_DECK.length)]);
                }
                setGestureHint(tRef.current.hintPinch);
              } else { setGestureHint(tRef.current.hintReady); }
            }
          } catch (e) {}
        }
      }

      if (!isPointerDown.current) {
        rotYSpeed.current = THREE.MathUtils.lerp(rotYSpeed.current, 0.002, 0.02);
        rotXSpeed.current = THREE.MathUtils.lerp(rotXSpeed.current, 0, 0.02);
      }
      rotY.current += rotYSpeed.current;
      rotX.current += rotXSpeed.current;

      if (galaxyPointsRef.current) {
        const pAttr = galaxyPointsRef.current.geometry.attributes.position;
        const mode = modeRef.current;
        const data = mainParticleDataRef.current;
        const lerpVal = 0.08;

        for (let i = 0; i < data.length; i++) {
          const p = data[i];
          let target = p.gPos;
          if (mode === MODES.DRAWING) { 
            if (p.isMessenger) target = new THREE.Vector3().lerpVectors(p.gPos, p.flyPos, Math.min((time - drawStartTime.current)/1.6, 1)); 
          } else if (mode === MODES.CARD) target = p.cPos;
          
          p.curr.lerp(target, lerpVal);
          let fx = p.curr.x, fy = p.curr.y, fz = p.curr.z;
          
          if (mode !== MODES.CARD) {
            const accretionAngle = rotY.current * (1.2 + (1.2 - p.distRatio) * accretionSpeed) * p.mass;
            const sY = Math.sin(accretionAngle), cY = Math.cos(accretionAngle);
            const sX = Math.sin(rotX.current), cX = Math.cos(rotX.current);
            let x1 = p.curr.x * cY - p.curr.z * sY;
            let z1 = p.curr.x * sY + p.curr.z * cY;
            let y2 = p.curr.y * cX - z1 * sX;
            let z2 = p.curr.y * sX + z1 * cX;
            fx = x1; fy = y2; fz = z2;
          }
          const flareDisplacement = flareVal * (1.0 - p.distRatio) * 2.8;
          pAttr.setXYZ(i, fx, fy + Math.sin(time*2.8+p.seed)*0.25 + flareDisplacement, fz);
        }
        pAttr.needsUpdate = true;
      }

      if (nebulaGroupRef.current && modeRef.current !== MODES.CARD) {
        nebulaGroupRef.current.children.forEach((sprite: any) => {
           sprite.material.opacity = sprite.baseOpacity * (1 + flareVal * 0.4);
           sprite.scale.setScalar(sprite.baseScale * (1 + flareVal * 0.08));
        });
        nebulaGroupRef.current.rotation.y = rotY.current * 0.15;
        nebulaGroupRef.current.rotation.x = rotX.current * 0.15;
      }
      
      if (coreRef.current) { 
        const baseScale = modeRef.current === MODES.CARD ? 0 : 1;
        coreRef.current.scale.setScalar(baseScale * (1 + Math.sin(time*4.5)*0.12 + flareVal * 0.25)); 
        coreRef.current.visible = modeRef.current !== MODES.CARD; 
      }
      composer.render();
    };

    const initModels = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm");
        recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: { 
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task", 
            delegate: "GPU" 
          },
          runningMode: "VIDEO"
        });
        setStatus(tRef.current.statusReady);
        setTimeout(() => setIsPreloaded(true), 1200);
      } catch (err) { 
        setIsPreloaded(true); 
        setStatus("Ready (Manual Only)"); 
      }
    };

    animate(); initModels();

    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current || !composerRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight; 
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight); 
      composerRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    const canvas = renderer.domElement;
    const handlePointerDown = (e: PointerEvent) => { 
      if ((e.target as HTMLElement).closest('button')) return;
      isPointerDown.current = true; 
      lastPointer.current = { x: e.clientX, y: e.clientY };
    };
    const handlePointerUp = () => { isPointerDown.current = false; };
    const handlePointerMove = (e: PointerEvent) => { 
      if (isPointerDown.current) { 
        const dX = e.clientX - lastPointer.current.x; 
        const dY = e.clientY - lastPointer.current.y;
        lastPointer.current = { x: e.clientX, y: e.clientY }; 
        rotYSpeed.current = THREE.MathUtils.lerp(rotYSpeed.current, dX * 0.005, 0.2); 
        rotXSpeed.current = THREE.MathUtils.lerp(rotXSpeed.current, dY * 0.005, 0.2);
      } 
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointermove', handlePointerMove);

    return () => { 
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointermove', handlePointerMove);
      recognizer?.close();
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, [setupM31Galaxy]);

  const startSensors = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCamActive(true);
      }
    } catch (err) {
      setStatus("Access Denied");
    }
  };

  const handleMenuMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsMenuDragging(true);
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isMenuDragging) return;
      const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
      setMenuPos({ x, y });
      const newId = ++trailIdCounter.current;
      setTrail(prev => [{ x, y, id: newId }, ...prev].slice(0, 20));
    };
    const handleUp = () => {
      setIsMenuDragging(false);
      setTimeout(() => setTrail([]), 800);
    };
    if (isMenuDragging) {
      window.addEventListener('mousemove', handleMove, { passive: true });
      window.addEventListener('mouseup', handleUp);
      window.addEventListener('touchmove', handleMove, { passive: true });
      window.addEventListener('touchend', handleUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isMenuDragging]);

  const t = I18N[lang];

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-[#000008] font-sans text-white touch-none">
      {!isPreloaded && (
        <div className="absolute inset-0 bg-[#000008] z-[100] flex flex-col items-center justify-center transition-opacity duration-1000">
           <div className="w-12 h-12 border-t-2 border-yellow-400 rounded-full animate-spin mb-8 shadow-[0_0_15px_rgba(255,255,0,0.4)]"></div>
           <div className="text-[9px] tracking-[0.8em] text-yellow-500/80 uppercase animate-pulse font-ethereal">{t.preloading}</div>
        </div>
      )}

      {/* 拖拽菜单 UI */}
      <div 
        className={`fixed z-[100] ${!isMenuDragging ? 'transition-[left,top] duration-150 ease-out' : ''}`}
        style={{ left: menuPos.x, top: menuPos.y, transform: 'translate(-50%, -50%)' }}
      >
        {trail.map((p, i) => (
          <div key={p.id} className="absolute rounded-full bg-gold/20 pointer-events-none blur-[6px] shadow-[0_0_12px_rgba(212,175,55,0.4)]" style={{ width: 16 - i * 0.7, height: 16 - i * 0.7, left: p.x - menuPos.x, top: p.y - menuPos.y, opacity: (20 - i) / 20, transform: 'translate(-50%, -50%)' }} />
        ))}
        <div className="relative flex items-center justify-center">
          <button onMouseDown={handleMenuMouseDown} onTouchStart={handleMenuMouseDown} onClick={() => !isMenuDragging && setIsMenuOpen(!isMenuOpen)} className={`w-10 h-10 rounded-full glass-ui border border-white/20 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.3)] transition-all hover:scale-110 active:scale-95 ${isMenuDragging ? 'scale-125 brightness-150 shadow-[0_0_25px_rgba(212,175,55,0.6)]' : ''}`}><span className={`text-lg transition-transform duration-500 ${isMenuOpen ? 'rotate-180 opacity-100 text-gold' : 'opacity-60 text-white'}`}>✧</span></button>
          {isMenuOpen && (
            <div className="absolute top-[110%] flex flex-col items-center gap-3 animate-fade-in pointer-events-auto">
               <button onClick={() => {setShowHelp(true); setIsMenuOpen(false);}} className="glass-ui w-10 h-10 flex items-center justify-center rounded-full border border-white/10 text-white/60 hover:text-gold hover:border-gold/40 transition-all shadow-lg"><span className="text-lg">?</span></button>
              <button onClick={() => {setLang(l => l==='en'?'cn':'en'); setIsMenuOpen(false);}} className="glass-ui w-10 h-10 flex items-center justify-center rounded-full border border-white/10 text-white/60 hover:text-gold hover:border-gold/40 transition-all uppercase text-[8px] font-bold shadow-lg">{lang === 'en' ? '中' : 'EN'}</button>
            </div>
          )}
        </div>
      </div>

      {/* 帮助弹窗 */}
      {showHelp && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-6 backdrop-blur-md bg-black/40 animate-fade-in pointer-events-auto">
          <div className="max-w-md w-full glass-ui p-8 md:p-10 rounded-[2rem] border-gold/30 shadow-2xl relative pointer-events-auto">
            <h2 className="font-ethereal text-xl md:text-2xl text-gold mb-6 tracking-widest uppercase text-center">{t.helpTitle}</h2>
            <div className="space-y-4 text-xs md:text-sm text-white/80 leading-relaxed font-light">
              <div className="flex gap-4"><span className="text-gold font-bold">●</span><p>{t.helpDrag}</p></div>
              <div className="flex gap-4"><span className="text-gold font-bold">●</span><p>{t.helpSensors}</p></div>
              <div className="flex gap-4"><span className="text-gold font-bold">●</span><p>{t.helpPinch}</p></div>
              <div className="flex gap-4"><span className="text-gold font-bold">●</span><p>{t.helpPalm}</p></div>
              <div className="flex gap-4"><span className="text-gold font-bold">●</span><p>{t.helpVictory}</p></div>
            </div>
            <button onClick={() => setShowHelp(false)} className="w-full mt-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-[10px] tracking-widest uppercase font-bold transition-all border border-white/5 pointer-events-auto">{t.helpClose}</button>
          </div>
        </div>
      )}

      {/* 主标题 */}
      <div className="absolute top-10 md:top-16 left-0 w-full text-center pointer-events-none z-10 px-6">
        <h1 className="font-ethereal text-2xl md:text-5xl tracking-[0.5em] glow-text text-white uppercase">{t.title}</h1>
        <p className="italic text-yellow-300/60 mt-3 text-[8px] md:text-[11px] tracking-[0.4em] uppercase font-light">{t.subtitle}</p>
      </div>

      {/* 塔罗结果弹窗 */}
      {reading && (
        <div className="absolute inset-0 flex items-center justify-center z-40 p-6 pointer-events-none backdrop-blur-sm">
          <div className="max-w-sm md:max-w-md w-full glass-ui p-8 md:p-12 rounded-[2.5rem] pointer-events-auto border-gold/40 animate-float shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)] text-center">
            <h2 className="font-ethereal text-2xl md:text-4xl text-yellow-400 mb-8 tracking-[0.4em] uppercase glow-text">{reading.cardName}</h2>
            <div className="space-y-8">
              <div className="bg-white/5 p-6 rounded-2xl border border-white/10 shadow-inner">
                <div className="text-[8px] md:text-[10px] text-gold/60 tracking-widest uppercase mb-3 font-semibold">{t.labelInsight}</div>
                <p className="text-white text-base md:text-xl italic font-light leading-tight">“{reading.insight}”</p>
              </div>
              <div className="px-2"><p className="text-white/70 italic text-xs md:text-sm leading-relaxed font-light">{reading.meaning}</p></div>
              <div className="flex justify-between items-center bg-yellow-400/5 p-5 rounded-2xl border border-yellow-400/15">
                <div className="text-left">
                  <div className="text-[8px] text-yellow-400/60 uppercase mb-1 font-bold">{t.labelAction}</div>
                  <p className="text-yellow-100/90 text-[10px] md:text-xs font-medium">{reading.action}</p>
                </div>
                <div className="flex gap-1.5">{[...Array(5)].map((_, i) => <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-700 ${i < reading.energy ? 'bg-yellow-400 shadow-[0_0_10px_#ffff00]' : 'bg-white/10'}`}></div>)}</div>
              </div>
            </div>
            <button onClick={handleDismiss} className="w-full mt-12 py-4 text-[9px] tracking-[0.8em] text-white/40 uppercase hover:text-gold transition-colors font-black border-t border-white/5 pt-8 pointer-events-auto">{t.dismiss}</button>
          </div>
        </div>
      )}

      {/* 中心圆球感测器按钮 */}
      {modeRef.current === MODES.GALAXY && !reading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <button 
            onClick={() => isCamActive ? stopSensors() : startSensors()}
            className={`pointer-events-auto w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-1000 glass-ui backdrop-blur-xl border relative overflow-hidden group ${isCamActive ? 'bg-gold/40 border-gold/60 shadow-[0_0_30px_rgba(212,175,55,0.6)] scale-125' : 'bg-gold/10 border-gold/30 hover:bg-gold/20 shadow-[0_0_15px_rgba(212,175,55,0.2)]'}`}
            title={isCamActive ? t.visionStop : t.visionBtn}
          >
             <div className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full transition-all duration-700 ${isCamActive ? 'bg-white shadow-[0_0_15px_#fff]' : 'bg-gold/40 animate-pulse'}`}></div>
             <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-gold/20 to-transparent opacity-60 animate-[spin_12s_linear_infinite]"></div>
          </button>
        </div>
      )}

      {/* 底部状态显示 */}
      <div className="absolute bottom-8 left-8 md:bottom-12 md:left-12 z-10 pointer-events-none">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-1.5 h-1.5 bg-yellow-400 animate-pulse rounded-full shadow-[0_0_8px_#ffff00]"></div>
          <div className="text-[9px] md:text-[10px] tracking-[0.3em] text-yellow-400 uppercase font-bold">{status || t.statusReady}</div>
        </div>
        <div className="text-xl md:text-2xl font-ethereal text-white/95 tracking-[0.15em]">{gestureHint || t.hintReady}</div>
      </div>

      <video ref={videoRef} className="fixed top-0 left-0 w-px h-px opacity-0 pointer-events-none" playsInline autoPlay muted />
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
    </div>
  );
};

export default GalacticTarot;
