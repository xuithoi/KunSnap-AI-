import { translations } from "./i18n";

export enum ImageModel {
  FLUX = 'Flux',
  SD1_5 = 'Stable Diffusion 1.5',
  FLUX_KONTEXT = 'Flux Kontext',
  QWEN_IMAGE = 'Qwen Image',
  FLUX_KREA = 'Flux Krea',
  QWEN_IMAGE_EDIT = 'Qwen Image Edit',
}

export enum PromptLength {
  SHORT = 'Short',
  MEDIUM = 'Medium',
  LONG = 'Long',
}

export interface ReferenceImage {
  base64: string;
  mimeType: string;
  name: string;
  width: number;
  height: number;
}

export interface GeneratedImage {
  base64: string;
  width: number;
  height: number;
}

export interface HistoryItem {
  id: number;
  base64: string;
  prompt: string;
  width: number;
  height: number;
}


export type TranslationKeys = keyof typeof translations.en;