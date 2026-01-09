
export interface StellarEntry {
  insight: string;  
  meaning: string;  
  action: string;   
  energy: number;    
}

export interface ReadingData extends StellarEntry {
  cardName: string; 
}

export interface TarotCard {
  id: string; 
  cn: string; 
  en: string; 
}

export enum MODES {
  GALAXY = 0,
  DRAWING = 1,
  CARD = 2
}
