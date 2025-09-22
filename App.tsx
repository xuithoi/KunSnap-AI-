// FIX: Removed ClipboardEvent from React import. The window.addEventListener uses the native DOM ClipboardEvent, not React's synthetic event type.
import React, { useState, useCallback, useEffect, DragEvent, useRef, WheelEvent, TouchEvent as ReactTouchEvent } from 'react';
import { ImageModel, PromptLength, ReferenceImage, TranslationKeys, GeneratedImage, HistoryItem } from './types';
import { enhancePrompt, generateImage, getPromptSuggestions, saveAndInitializeApiKey, analyzeImageForIssues, ImageIssue } from './services/geminiService';
import { translations } from './i18n';
import { loadingTips } from './loadingTips';
import { promptTags as promptTags_en } from './promptTags';
import { promptTags as promptTags_vi } from './promptTags_vi';
import { presetOptionsData } from './presetOptions';

declare const heic2any: any;

// Helper function to convert file to Base64 and get dimensions
const fileToBase64 = (file: File): Promise<ReferenceImage> => {
  return new Promise(async (resolve, reject) => {
    let fileToProcess = file;
    // Check if it's a HEIC/HEIF file and convert it if necessary
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name);

    if (isHeic) {
        try {
            if (typeof heic2any === 'undefined') {
                return reject(new Error("HEIC conversion library not loaded."));
            }
            const conversionResult = await heic2any({
                blob: file,
                toType: "image/jpeg",
                quality: 0.94,
            });
            const convertedBlob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
            fileToProcess = new File([convertedBlob], file.name.replace(/\.(heic|heif)$/i, '.jpeg'), { type: 'image/jpeg' });
        } catch (err) {
            console.error("HEIC conversion failed:", err);
            return reject(new Error("Failed to convert HEIC image. The file may be corrupted or unsupported."));
        }
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64String = dataUrl.split(',')[1];
      const img = new Image();
      img.onload = () => {
        resolve({
          base64: base64String,
          mimeType: fileToProcess.type,
          name: fileToProcess.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
      };
      img.onerror = (error) => reject(error);
      img.src = dataUrl;
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(fileToProcess);
  });
};

const getImageDimensions = (base64: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = (error) => reject(error);
    img.src = `data:image/png;base64,${base64}`;
  });
};

const triggerHapticFeedback = () => {
    if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(10);
    }
};


// SVG Icons
const UploadIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /> </svg> );
const CopyIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 4.5l-3-3m0 0l-3 3m3-3v12" /> </svg> );
const ClipboardIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>);
const CheckIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /> </svg> );
const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /> </svg> );
const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg> );
const ChevronLeftIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg> );
const ArrowsLeftRightIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h18m-7.5-14L21 6.5m0 0L16.5 11M21 6.5H3" /> </svg> );
const FullscreenIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9.75 9.75M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L14.25 9.75M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9.75 14.25m10.5 6L14.25 14.25" /> </svg> );
const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /> </svg> );
const CloseIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> </svg> );
const SparklesIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.5 21.75l-.398-1.178a3.375 3.375 0 00-2.456-2.456L12.5 18l1.178-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.178a3.375 3.375 0 002.456 2.456L20.5 18l-1.178.398a3.375 3.375 0 00-2.456 2.456z" /> </svg> );
const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.664 0l3.18-3.185m-3.181 9.348a8.25 8.25 0 00-11.664 0l-3.18 3.185m3.181-9.348L16.023 9.348" /> </svg> );
const TrashIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.124-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.077-2.09.921-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /> </svg> );
const SunIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.95-4.243l-1.59-1.591M5.25 12H3m4.243-4.95l-1.59-1.591M12 12a2.25 2.25 0 00-2.25 2.25c0 1.31.85 2.423 2 2.625V12z" /> <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a2.25 2.25 0 012.25 2.25c0 1.31-.85 2.423-2 2.625V12zM12 12a8.25 8.25 0 100 16.5 8.25 8.25 0 000-16.5z" /> </svg> );
const MoonIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"> <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /> </svg> );
const SendIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg> );
const HistoryIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg> );
const DevicePhoneMobileIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg> );
const DeviceTabletIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 002.25-2.25v-15a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 4.5v15a2.25 2.25 0 002.25 2.25z" /></svg> );
const ComputerDesktopIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" /></svg> );
const CameraIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg> );
const BrushIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.998 15.998 0 011.622-3.385m5.043.025a15.998 15.998 0 001.622-3.385m3.388 1.62a15.998 15.998 0 00-1.622-3.385m-5.043.025a15.998 15.998 0 01-3.388-1.621m7.5 4.242a3 3 0 00-1.128-5.78 2.25 2.25 0 01-2.245-2.4 4.5 4.5 0 00-2.245-8.4c-.399 0-.78.078-1.128.22a3 3 0 001.128 5.78 2.25 2.25 0 012.4 2.245 4.5 4.5 0 008.4 2.245c0 .399-.078.78-.22.128zm-8.4-2.245a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128z" /></svg> );
const CompassIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75L12 12m0 0l3.75-1.5M12 12l-3.75-1.5M12 12l1.5 3.75M12 12l-1.5 3.75" /></svg> );
const KeyIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /></svg> );
const BookOpenIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg> );
const FacebookIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"></path></svg> );
const InstagramIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.85s-.011 3.584-.069 4.85c-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07s-3.584-.012-4.85-.07c-3.252-.148-4.771-1.691-4.919-4.919-.058-1.265-.069-1.645-.069-4.85s.011-3.584.069-4.85c.149-3.225 1.664-4.771 4.919-4.919 1.266-.058 1.644-.07 4.85-.07zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948s.014 3.667.072 4.947c.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072s3.667-.014 4.947-.072c4.358-.2 6.78-2.618 6.98-6.98.059-1.281.073-1.689-.073-4.948s-.014-3.667-.072-4.947c-.2-4.358-2.618-6.78-6.98-6.98-1.281-.058-1.689-.072-4.948-.072zM12 6.873c-2.849 0-5.127 2.278-5.127 5.127s2.278 5.127 5.127 5.127 5.127-2.278 5.127-5.127-2.278-5.127-5.127-5.127zm0 8.254c-1.732 0-3.127-1.395-3.127-3.127s1.395-3.127 3.127-3.127 3.127 1.395 3.127 3.127-1.395 3.127-3.127 3.127zm6.329-9.522c-.764 0-1.383.62-1.383 1.383s.62 1.383 1.383 1.383 1.383-.62 1.383-1.383-.62-1.383-1.383-1.383z"></path></svg> );
const GitHubIcon: React.FC<{ className?: string }> = ({ className }) => ( <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"></path></svg> );
const LogoIcon: React.FC<{ className?: string }> = ({ className }) => ( <div className={`logo-mask ${className}`}></div> );


// Progress Bar Component
interface ProgressBarProps {
    progress: number;
    label: string;
    tip?: string;
    translate: (key: TranslationKeys) => string;
}
const ProgressBar: React.FC<ProgressBarProps> = ({ progress, label, tip, translate }) => {
    return (
        <div className="w-full max-w-md mx-auto px-4">
            <p className="text-center text-sm mb-2 text-sky-700 dark:text-cyan-200 tracking-widest">{label}</p>
            <div className="w-full bg-sky-200 dark:bg-cyan-900/50 rounded-full h-1.5" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div 
                    className="bg-sky-500 dark:bg-cyan-400 h-1.5 rounded-full shadow-[0_0_10px_var(--primary-color-glow)] transition-all duration-300 ease-linear" 
                    style={{ width: `${progress}%` }}
                ></div>
            </div>
             {tip && (
                <p key={tip} className="text-center text-sm mt-4 text-slate-600 dark:text-cyan-200/80 animate-[fadeIn_0.5s_ease-out]">
                    <span className="font-bold">{translate('tipPrefix')}: </span>{tip}
                </p>
            )}
        </div>
    );
};

// Image Comparator Component
interface ImageComparatorProps { beforeImage: ReferenceImage; afterImage: GeneratedImage; }
const ImageComparator: React.FC<ImageComparatorProps> = ({ beforeImage, afterImage }) => {
    const [sliderPosition, setSliderPosition] = useState(50);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const handleInteraction = (clientX: number) => { if (!containerRef.current) return; const rect = containerRef.current.getBoundingClientRect(); const x = clientX - rect.left; const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100)); setSliderPosition(percentage); };
    const handleMouseDown = () => { isDragging.current = true; };
    const handleMouseUp = () => { isDragging.current = false; };
    const handleMouseLeave = () => { isDragging.current = false; };
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => { if (!isDragging.current) return; handleInteraction(e.clientX); };
    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => { if (!isDragging.current) return; handleInteraction(e.touches[0].clientX); };
    return (
        <div ref={containerRef} className="relative w-full h-full aspect-square overflow-hidden select-none cursor-ew-resize rounded-md" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onTouchStart={handleMouseDown} onTouchEnd={handleMouseUp} onTouchMove={handleTouchMove}>
            <img src={`data:${beforeImage.mimeType};base64,${beforeImage.base64}`} alt="Before" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
            <div className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}> <img src={`data:image/png;base64,${afterImage.base64}`} alt="After" className="absolute inset-0 w-full h-full object-contain pointer-events-none" /> </div>
            <div className="absolute top-0 bottom-0 w-0.5 bg-cyan-300/80 pointer-events-none shadow-[0_0_10px_rgba(0,255,255,0.7)]" style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-sky-500/50 dark:bg-cyan-400/50 rounded-full flex items-center justify-center backdrop-blur-sm border border-sky-400/50 dark:border-cyan-300/50">
                    <ArrowsLeftRightIcon className="w-6 h-6 text-white" />
                </div>
            </div>
        </div>
    );
};

// Reusable Image Zoom Viewer
interface ImageZoomViewerProps { isOpen: boolean; imageUrl: string; altText: string; onClose: () => void; showNavigation?: boolean; onNext?: () => void; onPrev?: () => void; }
const ImageZoomViewer: React.FC<ImageZoomViewerProps> = ({ isOpen, imageUrl, altText, onClose, showNavigation, onNext, onPrev }) => {
    const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 }); const [isPanning, setIsPanning] = useState(false); const [initialZoom, setInitialZoom] = useState(1); const lastMousePosition = useRef({ x: 0, y: 0 }); const imageContainerRef = useRef<HTMLDivElement>(null); const imageRef = useRef<HTMLImageElement>(null);
    const touchStartRef = useRef<number | null>(null);

    const resetZoomAndPan = useCallback(() => { setZoom(initialZoom); setPan({ x: 0, y: 0 }); }, [initialZoom]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if (showNavigation) {
                if (event.key === 'ArrowRight' && onNext) onNext();
                if (event.key === 'ArrowLeft' && onPrev) onPrev();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose, showNavigation, onNext, onPrev]);
    
    const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => { touchStartRef.current = e.touches[0].clientX; };
    const handleTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
        if (touchStartRef.current === null) return;
        const touchEnd = e.touches[0].clientX;
        const diff = touchStartRef.current - touchEnd;
        if (Math.abs(diff) > 75) { // Swipe threshold
            if (diff > 0 && onNext) { onNext(); } 
            else if (diff < 0 && onPrev) { onPrev(); }
            touchStartRef.current = null; // Reset after swipe
        }
    };

    const handleImageLoad = () => {
        if (!imageRef.current || !imageContainerRef.current) return;
        const { naturalWidth, naturalHeight } = imageRef.current;
        const { width: containerWidth, height: containerHeight } = imageContainerRef.current.getBoundingClientRect();
        const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight, 1);
        setInitialZoom(scale);
        setZoom(scale);
        setPan({ x: 0, y: 0 });
    };

    const handleWheel = (e: WheelEvent) => { e.preventDefault(); const zoomFactor = 1.1; const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor; setZoom(Math.max(0.1, Math.min(newZoom, 10))); };
    const handleMouseDown = (e: React.MouseEvent) => { e.preventDefault(); setIsPanning(true); lastMousePosition.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseMove = (e: React.MouseEvent) => { if (!isPanning) return; const dx = e.clientX - lastMousePosition.current.x; const dy = e.clientY - lastMousePosition.current.y; setPan(prev => ({ x: prev.x + dx, y: prev.y + dy })); lastMousePosition.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseUp = () => setIsPanning(false);
    const handleDoubleClick = () => { setZoom(prev => (Math.abs(prev - initialZoom) < 0.01 ? initialZoom * 2.5 : initialZoom)); setPan({ x: 0, y: 0 }); };

    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-[fadeIn_0.3s_ease-out]" onClick={onClose}>
            <button title="Close" className="absolute top-4 right-4 text-cyan-300 hover:text-white transition-opacity z-50" onClick={onClose}> <CloseIcon className="w-8 h-8" /> </button>
            {showNavigation && onPrev && <button onClick={(e)=>{e.stopPropagation(); onPrev();}} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/40 rounded-full text-white hover:bg-black/70 z-50"><ChevronLeftIcon className="w-8 h-8"/></button>}
            {showNavigation && onNext && <button onClick={(e)=>{e.stopPropagation(); onNext();}} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/40 rounded-full text-white hover:bg-black/70 z-50"><ChevronRightIcon className="w-8 h-8"/></button>}
            <div ref={imageContainerRef} className="relative w-full h-full flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onDoubleClick={handleDoubleClick} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}>
                <img ref={imageRef} src={imageUrl} alt={altText} onLoad={handleImageLoad} className={`max-w-none max-h-none transition-transform duration-75 ease-out ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`} style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }} />
            </div>
            <div className="absolute bottom-4 w-full max-w-sm px-4 z-20" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center space-x-4 bg-black/60 backdrop-blur-sm p-2 rounded-xl border border-cyan-400/30 hud-border">
                    <button onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="px-3 py-1 text-lg font-bold bg-cyan-900/80 rounded-md hover:bg-cyan-800 btn-hover-effect">-</button>
                    <input type="range" min={initialZoom / 2} max="10" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-full h-2 bg-cyan-900/80 rounded-lg appearance-none cursor-pointer" />
                    <button onClick={() => setZoom(z => Math.min(10, z + 0.2))} className="px-3 py-1 text-lg font-bold bg-cyan-900/80 rounded-md hover:bg-cyan-800 btn-hover-effect">+</button>
                    <button onClick={resetZoomAndPan} className="p-2 bg-cyan-900/80 rounded-md hover:bg-cyan-800 btn-hover-effect"> <RefreshIcon className="w-5 h-5" /> </button>
                </div>
            </div>
        </div>
    );
};

const HISTORY_LIMIT = 15;

type View = 'create' | 'history' | 'guide';

// New component for the API Key Modal
const ApiKeyModal: React.FC<{
    isOpen: boolean;
    onSave: (key: string) => void;
    onClose?: () => void;
    showCloseButton?: boolean;
    translate: (key: TranslationKeys) => string;
}> = ({ isOpen, onSave, translate, onClose, showCloseButton }) => {
    const [apiKey, setApiKey] = useState('');
    const [error, setError] = useState('');

    const handleSave = () => {
        const trimmedKey = apiKey.trim();
        if (!trimmedKey) {
            setError(translate('apiKeyErrorRequired'));
            return;
        }
        setError('');
        onSave(trimmedKey);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 animate-[fadeIn_0.3s_ease-out]" onClick={showCloseButton ? onClose : undefined}>
            <div className="relative hud-border rounded-xl shadow-lg p-6 space-y-4 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                {showCloseButton && (
                    <button onClick={onClose} className="absolute top-2 right-2 text-[var(--text-color-muted)] hover:text-[var(--text-color)] transition-colors p-1 z-10">
                        <CloseIcon className="w-6 h-6" />
                    </button>
                )}
                <h2 className="text-2xl font-bold text-center text-[var(--primary-color)]">{translate('apiKeyModalTitle')}</h2>
                <p className="text-sm text-center text-[var(--text-color-muted)]">
                    {translate('apiKeyModalDescription')}
                    <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="font-semibold text-[var(--primary-color)] hover:underline"
                    >
                        {translate('apiKeyModalDescriptionLink')}
                    </a>.
                </p>
                <div>
                    <label htmlFor="api-key-input" className="block text-sm font-medium text-[var(--text-color)] mb-1">
                        {translate('apiKeyModalLabel')}
                    </label>
                    <input
                        id="api-key-input"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={translate('apiKeyModalPlaceholder')}
                        className="w-full p-3 bg-[var(--input-bg-color)] border border-[var(--input-border-color)] rounded-lg focus:ring-2 focus:ring-[var(--primary-color)] transition-all"
                    />
                </div>
                {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                <button
                    onClick={handleSave}
                    className="w-full bg-[var(--button-primary-bg)] hover:brightness-110 text-[var(--button-primary-text)] font-bold py-3 px-4 rounded-lg transition-all duration-300 shadow-lg active:scale-95 btn-hover-effect"
                >
                    {translate('apiKeyModalSaveButton')}
                </button>
            </div>
        </div>
    );
};

const initialManualFixes: Record<string, boolean> = {
    professionalize: false,
    composition: false,
    lighting: false,
    colors: false,
    sharpness: false,
    noise: false,
    chromatic_aberration: false,
    shadows: false,
    highlights: false,
    contrast: false,
    skin_heal: false,
    skin_tone: false,
    skin_mattify: false,
    skin_dodge_burn: false,
    skin_eyes: false,
    skin_teeth: false,
    fabric: false,
    backdrop: false,
};

const issueToFixMap: Record<ImageIssue, keyof typeof initialManualFixes> = {
    POOR_COMPOSITION: 'composition',
    UNBALANCED_LIGHTING: 'lighting',
    DULL_COLORS: 'colors',
    BLURRY_OR_SOFT: 'sharpness',
    IMAGE_NOISE: 'noise',
    CHROMATIC_ABERRATION: 'chromatic_aberration',
    HARSH_SHADOWS: 'shadows',
    WASHED_OUT_HIGHLIGHTS: 'highlights',
    LOW_CONTRAST: 'contrast',
    OVERSATURATED_COLORS: 'colors',
    SKIN_BLEMISHES: 'skin_heal',
    UNEVEN_SKIN_TONE: 'skin_tone',
    OILY_SKIN_SHINE: 'skin_mattify',
    DULL_EYES: 'skin_eyes',
    YELLOW_TEETH: 'skin_teeth',
};

const presetColorClasses: Record<string, string> = {
  restore: 'btn-neon-restore',
  relight: 'btn-neon-relight',
  style: 'btn-neon-style',
  background: 'btn-neon-background',
  clothing: 'btn-neon-clothing',
  passport: 'btn-neon-passport',
  edit: 'btn-neon-edit',
  color_match: 'btn-neon-color_match',
};


const App: React.FC = () => {
  const [mode, setMode] = useState<'pro' | 'presets'>('presets');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Pro Mode State
  const [originalPrompt, setOriginalPrompt] = useState<string>('');
  const [model, setModel] = useState<ImageModel>(ImageModel.FLUX);
  const [length, setLength] = useState<PromptLength>(PromptLength.MEDIUM);
  const [images, setImages] = useState<ReferenceImage[]>([]);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
  const [suggestionProgress, setSuggestionProgress] = useState(0);
  const [suggestionError, setSuggestionError] = useState<string>('');
  
  // Preset Mode State
  const [presetImages, setPresetImages] = useState<ReferenceImage[][]>([[]]);
  const [presetOptions, setPresetOptions] = useState<Record<string, any>>({});
  const [presetPrompt, setPresetPrompt] = useState('');

  // Edit Preset State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [detectedIssues, setDetectedIssues] = useState<ImageIssue[]>([]);
  const [manualFixes, setManualFixes] = useState<Record<string, boolean>>(initialManualFixes);
  const [analysisError, setAnalysisError] = useState('');

  // General State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [enhanceProgress, setEnhanceProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [language, setLanguage] = useState<'en' | 'vi'>('vi');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [activeDropzone, setActiveDropzone] = useState<number | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | undefined>(undefined);
  const [isResultCopied, setIsResultCopied] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [fullscreenRefImage, setFullscreenRefImage] = useState<ReferenceImage | null>(null);
  const [historyViewerIndex, setHistoryViewerIndex] = useState<number | null>(null);
  const [mainResultViewerOpen, setMainResultViewerOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [currentTip, setCurrentTip] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeSendMenu, setActiveSendMenu] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'pc' | 'tablet' | 'mobile'>('pc');
  const [activeView, setActiveView] = useState<View>('create');
  
  // App Entry State
  const [showMainMenu, setShowMainMenu] = useState(true);

  // API Key and Initialization State
  const [isAppReady, setIsAppReady] = useState(false);
  const [isApiModalOpen, setIsApiModalOpen] = useState(false);

  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendMenuRef = useRef<HTMLDivElement>(null);

  const t = useCallback((key: TranslationKeys) => translations[language][key] || key, [language]);
  const currentPromptTags = language === 'vi' ? promptTags_vi : promptTags_en;
  const currentPresetOptions = presetOptionsData[language];
  
  useEffect(() => {
    // In AI Studio, process.env.API_KEY exists. Locally, we check localStorage.
    const keyExists = !!process.env.API_KEY || !!localStorage.getItem('user_api_key');
    if (keyExists) {
      setIsAppReady(true);
    } else {
      // If no key is found anywhere, open the modal.
      setIsApiModalOpen(true);
    }

    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
    
    try {
        const savedHistory = localStorage.getItem('generationHistory');
        if (savedHistory) {
            const loadedHistory = JSON.parse(savedHistory);
            // Apply limit on load to prevent issues with oversized old histories
            setHistory(Array.isArray(loadedHistory) ? loadedHistory.slice(0, HISTORY_LIMIT) : []);
        }
    } catch (e) {
        console.error("Failed to load history from localStorage", e);
        setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);
  
  useEffect(() => {
    try {
        // The history state is now always capped, so this should not fail.
        localStorage.setItem('generationHistory', JSON.stringify(history));
    } catch (e) {
        console.error("Failed to save history to localStorage", e);
    }
  }, [history]);
  
  const toggleTheme = useCallback(() => setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark'), []);

  useEffect(() => {
    let tipInterval: ReturnType<typeof setInterval> | null = null;
    const isLoadingAny = isLoading || isGeneratingImage || isSuggesting || isAnalyzing;
    if (isLoadingAny) {
      const tips = loadingTips.map(tip => tip[language]);
      const showNewTip = () => {
        const randomIndex = Math.floor(Math.random() * tips.length);
        setCurrentTip(tips[randomIndex]);
      };
      showNewTip();
      tipInterval = setInterval(showNewTip, 5000);
    }
    return () => { if (tipInterval) clearInterval(tipInterval); };
  }, [isLoading, isGeneratingImage, isSuggesting, isAnalyzing, language]);
  
  const handleApiError = useCallback((err: unknown): string => {
    if (err instanceof Error) {
        if (err.message === 'API_KEY_MISSING') {
            setIsApiModalOpen(true); // Re-open the modal if the key is missing/invalid
            return t('apiKeyModalTitle');
        }
        if (err.message === 'ERROR_PROMPT_REJECTED') {
            return t('errorPromptRejected');
        }
        return err.message;
    }
    return t('errorUnknown');
  }, [t]);

  const handleSaveApiKey = (key: string) => {
    saveAndInitializeApiKey(key);
    setIsApiModalOpen(false);
    setIsAppReady(true);
    // The user can now retry their action.
  };

  const handleFiles = useCallback(async (files: FileList | null, imageStateSetter: React.Dispatch<React.SetStateAction<ReferenceImage[]>>, multi: boolean = true) => { if (!files || files.length === 0) return; const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name)); if (imageFiles.length === 0) { setError(t('errorInvalidFileType')); return; } setError(''); try { const imagePromises = imageFiles.map(file => fileToBase64(file)); const newImages = await Promise.all(imagePromises); if(multi) { imageStateSetter(prev => [...prev, ...newImages]); } else { imageStateSetter(newImages); } } catch (err) { if (err instanceof Error && err.message.includes("HEIC")) { setError(t('errorHeicConversion')); } else { setError(t('errorImageProcessing')); } } }, [t]);
  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>, imageStateSetter: React.Dispatch<React.SetStateAction<ReferenceImage[]>>, multi: boolean = true, dropzoneIndex: number | null = null) => { event.preventDefault(); event.stopPropagation(); setIsDragging(false); setActiveDropzone(null); handleFiles(event.dataTransfer.files, imageStateSetter, multi); }, [handleFiles]);
  
  const isPresetInputSingle = (preset: string | null, index: number) => {
    switch(preset) {
        case 'restore':
        case 'relight':
        case 'style':
        case 'passport':
        case 'edit':
            return index === 0;
        case 'background':
        case 'color_match':
            return index === 0 || index === 1;
        case 'clothing':
            return index === 0;
        default:
            return false;
    }
  }

  useEffect(() => {
      const handleWindowPaste = (event: ClipboardEvent) => {
          if (activeView !== 'create' || !event.clipboardData?.files?.length) {
              return;
          }

          const imageFiles = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name));
          if (imageFiles.length === 0) {
              return;
          }
          
          triggerHapticFeedback();
          
          const dataTransfer = new DataTransfer();
          imageFiles.forEach(file => dataTransfer.items.add(file));

          if (mode === 'pro') {
              handleFiles(dataTransfer.files, setImages, true);
          } else if (selectedPreset) {
              // Paste into the first available image slot for multi-input presets
              const firstEmptyIndex = presetImages.findIndex(slot => !slot || slot.length === 0);
              const targetIndex = firstEmptyIndex !== -1 ? firstEmptyIndex : 0;
      
              const setter = (updater: React.SetStateAction<ReferenceImage[]>) => {
                  setPresetImages(prev => {
                      const newImages = [...prev];
                      const currentSlot = newImages[targetIndex] || [];
                      newImages[targetIndex] = typeof updater === 'function' ? updater(currentSlot) : updater;
                      return newImages;
                  });
              };
              
              const isSingle = isPresetInputSingle(selectedPreset, targetIndex);
              handleFiles(dataTransfer.files, setter, !isSingle);
          }
      };
  
      window.addEventListener('paste', handleWindowPaste);
      return () => window.removeEventListener('paste', handleWindowPaste);
  }, [activeView, mode, selectedPreset, presetImages, handleFiles, isPresetInputSingle]);
  
  const handleAddTag = (tag: string) => { 
    setOriginalPrompt(prev => { 
        if (!prev.trim()) return tag; 
        const separator = prev.trim().endsWith(',') ? ' ' : ', '; 
        return `${prev.trim()}${separator}${tag}`; 
    }); 
  };

  const startProgressSimulation = (setProgress: React.Dispatch<React.SetStateAction<number>>, duration: number) => { if (progressInterval.current) clearInterval(progressInterval.current); setProgress(0); const intervalTime = duration / 100; progressInterval.current = setInterval(() => { setProgress(oldProgress => { if (oldProgress >= 95) { if (progressInterval.current) clearInterval(progressInterval.current); return oldProgress; } return oldProgress + 1; }); }, intervalTime); };
  const stopProgressSimulation = (setProgress: React.Dispatch<React.SetStateAction<number>>) => { if (progressInterval.current) clearInterval(progressInterval.current); setProgress(100); setTimeout(() => setProgress(0), 500); };

  const handleEnhanceClick = useCallback(async () => { if (!originalPrompt.trim() || isLoading) { if(!originalPrompt.trim()) setError(t('errorPromptRequired')); return; } setIsLoading(true); setError(''); setEnhancedPrompt(''); startProgressSimulation(setEnhanceProgress, 8000); try { const result = await enhancePrompt(originalPrompt, model, length, images); setEnhancedPrompt(result); } catch (err) { setError(handleApiError(err)); } finally { stopProgressSimulation(setEnhanceProgress); setIsLoading(false); } }, [originalPrompt, model, length, images, isLoading, t, handleApiError]);
  const handleCopyToClipboard = useCallback(() => { if (enhancedPrompt) { navigator.clipboard.writeText(enhancedPrompt); triggerHapticFeedback(); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); } }, [enhancedPrompt]);
  
  const handleAnalyzeImage = useCallback(async () => {
    if (!presetImages[0] || presetImages[0].length === 0) return;
    const imageToAnalyze = presetImages[0][0];

    setIsAnalyzing(true);
    setAnalysisError('');
    setDetectedIssues([]);
    startProgressSimulation(setAnalysisProgress, 6000);

    try {
        const issues = await analyzeImageForIssues(imageToAnalyze);
        setDetectedIssues(issues);
        
        // Reset and then set fixes based on detected issues
        const newFixes = { ...initialManualFixes };
        issues.forEach(issue => {
            const fixKey = issueToFixMap[issue];
            if (fixKey) {
                newFixes[fixKey] = true;
            }
        });
        setManualFixes(newFixes);

    } catch (err) {
        setAnalysisError(handleApiError(err));
    } finally {
        stopProgressSimulation(setAnalysisProgress);
        setIsAnalyzing(false);
    }
}, [presetImages, handleApiError]);

  const handleGenerateImageClick = useCallback(async () => {
    let promptToUse = '';
    let imagesToUse: ReferenceImage[] = [];
    let aspectInstruction = '';
    let generationError = '';

    if (mode === 'pro') {
        promptToUse = enhancedPrompt.trim() || originalPrompt.trim();
        imagesToUse = images;
    } else {
        // Build prompt from preset options, with intelligent defaults
        switch (selectedPreset) {
            case 'restore':
                let restoreActions = [];
                if (presetOptions.restoreDetails) restoreActions.push("meticulously restore scratches, dust, and damage, enhancing sharpness");
                if (presetOptions.recolor) restoreActions.push("colorize the photo with historically accurate and natural colors");
                
                if (restoreActions.length > 0) {
                    promptToUse = `Task: ${restoreActions.join(' and ')} for this old photograph. ${presetPrompt}`;
                } else {
                    promptToUse = `Task: Automatically analyze and restore this old photograph. Identify and repair common issues like scratches, dust, and fading. If it's black and white, intelligently colorize it with natural, period-appropriate colors. Enhance sharpness and clarity while preserving the original character. ${presetPrompt}`;
                }
                break;
            case 'relight':
                if (presetOptions.lightStyle || presetOptions.lightDirection) {
                    // User has made specific choices
                    promptToUse = `**TASK: Professional & Dramatic Image Re-Lighting.**

**ABSOLUTE RULE: You MUST completely change the lighting of the image. IGNORE the original lighting and apply a new, physically-accurate lighting scheme as described below. The change must be significant and obvious.**

**New Lighting Scheme:**
*   **Style:** ${presetOptions.lightStyle || 'Natural Sunlight'}
*   **Direction:** From the ${presetOptions.lightDirection || 'front'}

**Instructions:**
1.  **Analyze Scene Geometry:** Understand the 3D form of all subjects and objects in the image.
2.  **Apply New Light Source:** Realistically cast the new '${presetOptions.lightStyle || 'Natural Sunlight'}' light from the specified direction.
3.  **Create Accurate Shadows:** The new light source MUST cast physically-correct shadows. The direction, softness, and length of shadows must match the new light style and direction perfectly.
4.  **Maintain Subject Integrity:** DO NOT change the subjects, their poses, clothing, or the camera's composition. ONLY the lighting and shadows are to be transformed.
5.  **Final Output:** The result must be a photorealistic image where the lighting has been dramatically and convincingly altered. ${presetPrompt}`;
                } else {
                    // Automatic mode
                    promptToUse = `**TASK: Professional Automatic Image Re-Lighting.**

**Primary Goal: Dramatically improve the image's lighting to make it look professional, captivating, and cinematic. Do not just make minor adjustments; create a new, superior lighting environment from scratch.**

**Instructions:**
1.  **Analyze Subject & Mood:** Identify the main subject and the potential mood of the photo (e.g., portrait, landscape, action shot).
2.  **Choose an Optimal Lighting Style:** Based on your analysis, select a professional lighting style that best complements the subject. Examples include: soft cinematic lighting, warm golden hour light, dramatic Rembrandt lighting, or clean three-point studio lighting.
3.  **Apply the New Light:** Re-light the entire scene with your chosen style. This includes creating new virtual light sources and ensuring they cast realistic highlights and physically-accurate shadows.
4.  **Enhance Dynamic Range:** Sculpt the image with light, ensuring there are rich shadows and bright, detailed highlights for a full tonal range.
5.  **Maintain Realism:** The final result must look photorealistic and believable, as if it were shot by a professional photographer with an expert lighting setup. Do not alter the content of the image. ${presetPrompt}`;
                }
                break;
            case 'style':
                promptToUse = `Task: Transform the image into the ${presetOptions.style || 'Photorealistic'} style, preserving the main subject and composition. ${presetPrompt}`;
                break;
            case 'background':
                 promptToUse = `This is a high-fidelity background replacement task. The first image contains the subject to be extracted. The second image is the new background. Your task is to: 1. Create a perfect, detailed mask of the subject, paying extreme attention to fine details like hair, fur, and semi-transparent edges. 2. Composite the extracted subject onto the new background. 3. CRITICAL: Analyze the lighting of the new background (direction, color, intensity) and realistically relight the subject to match. This includes casting appropriate shadows from the subject onto the background and adjusting color temperatures and reflections. The final result must be a seamless, photorealistic composition. ${presetPrompt}`;
                 imagesToUse = [...(presetImages[0] || []), ...(presetImages[1] || [])];
                 break;
            case 'clothing':
                promptToUse = `Task: Change the clothing of the person in the first image. The subsequent images are references for the new outfit. Analyze the style, type, color, and texture of the clothing in the reference images. Then, apply a new outfit inspired by these references to the person in the first image. Ensure the new clothing fits their body shape and pose naturally. Blend lighting and shadows for a realistic result. ${presetPrompt ? `Specific instructions: ${presetPrompt}.` : ''}`;
                imagesToUse = [...(presetImages[0] || []), ...(presetImages[1] || [])];
                break;
            case 'passport':
                 if (presetOptions.outfit || presetOptions.bgColor) {
                    promptToUse = `Task: Recreate this portrait as a professional passport photo. Change the outfit to ${presetOptions.outfit || 'a white shirt and black vest'}. Change the background to a solid ${presetOptions.bgColor || 'light blue'} color. The final image should have neutral lighting and a professional appearance. ${presetPrompt}`;
                 } else {
                    promptToUse = `Task: Automatically convert this portrait into a professional passport-style photograph. The background must be changed to a solid, neutral color (like light blue or off-white). The subject's clothing should be changed to simple, professional attire (e.g. a collared shirt or blouse). Ensure the lighting is even and neutral, with no harsh shadows, and the subject's expression is neutral. ${presetPrompt}`;
                 }
                break;
            case 'color_match':
                promptToUse = `**ABSOLUTE RULE: EDIT THE FIRST IMAGE. DO NOT CHANGE ITS CONTENT, SUBJECT, OR COMPOSITION.**

This is a professional color grading transfer task. You have two images:
- **Image 1 (Source):** The image to be edited. Its content MUST be preserved.
- **Image 2 (Reference):** The style reference. Its content should be IGNORED.

Your task is to analyze the complete visual aesthetic of Image 2 (color palette, tone curve, contrast, lighting) and apply that exact aesthetic to Image 1. The output must be the edited version of Image 1. ${presetPrompt}`;
                imagesToUse = [...(presetImages[0] || []), ...(presetImages[1] || [])];
                break;
            case 'edit':
                const fixPrompts: Record<string, string> = {
                    professionalize: `
**TASK: Creative & Professional Image Remastering.**
You are a world-class creative director and photo retoucher. Your goal is to take this amateur-looking photo and transform it into a breathtaking, magazine-quality masterpiece. You have full creative freedom to achieve this.

**PROCESS:**
1.  **Artistic Re-Lighting:** Do not just balance the existing light. **Dramatically re-imagine the lighting.** Introduce new, artistic light sources. For example, create soft rim lighting, a warm golden hour glow, or cinematic key lights to sculpt the subject and create a powerful mood.
2.  **Compositional Improvement:** If necessary, **re-compose the shot**. You can crop the image to create a more powerful, balanced, or dynamic composition that draws the eye to the main subject.
3.  **Background Enhancement:** Artistically enhance the background to complement the subject and improve the overall composition. The goal is to make the subject stand out. Depending on the context, this could mean subtly increasing the depth of field (bokeh) for portraits, or keeping the background sharp and clean for landscapes or architectural shots. You are also free to add subtle textures or shift colors.
4.  **High-End Retouching:** Apply professional retouching techniques.
    *   **Simulate High-End Optics:** Process the image to look like it was captured on a top-tier full-frame camera and a prime lens (e.g., 85mm f/1.2).
    *   **Refine Color & Tone:** Apply sophisticated color grading to create a cohesive and evocative mood. Ensure perfect skin tones and rich, deep colors.
    *   **Enhance Micro-contrast & Detail:** Make details pop and add dimensionality, especially in textures like fabric, hair, and eyes.
5.  **Final Vision:** The final result should be a stunning, artistic interpretation that is dramatically superior to the original. It should look intentional, professional, and visually captivating.`,
                    composition: "Subtly improve the composition, potentially through rule-of-thirds cropping, to enhance the main subject.",
                    lighting: "Balance the overall lighting. Correct any under or overexposed areas for a full dynamic range.",
                    colors: "Enhance the colors. Correct the white balance, increase vibrancy and saturation naturally without looking artificial. Fix any color casts.",
                    sharpness: "Increase sharpness and clarity. Deblur any softness and enhance fine details and textures.",
                    noise: "Reduce any visible image noise or grain, especially in shadow areas, while preserving detail.",
                    chromatic_aberration: "Remove any chromatic aberration (color fringing), especially around high-contrast edges.",
                    shadows: "Soften harsh shadows and recover details from dark areas.",
                    highlights: "Recover details from blown-out or washed-out highlights.",
                    contrast: "Improve the overall contrast, making the image pop without crushing blacks or whites.",
                    skin_heal: "Perform high-end skin retouching. Meticulously remove blemishes, pimples, and minor scars while perfectly preserving the natural skin texture using a frequency separation-like technique.",
                    skin_tone: "Even out the skin tone across the face and body. Correct any redness, blotchiness, or discoloration for a smooth, uniform complexion.",
                    skin_mattify: "Reduce oily shine on the skin. Apply a subtle mattifying effect to areas like the forehead, nose, and chin for a clean, professional look.",
                    skin_dodge_burn: "Apply a subtle and professional dodge and burn effect to enhance facial contours and create volume. Lighten areas like the bridge of the nose and under the eyes, and darken areas like the cheekbones to add depth.",
                    skin_eyes: "Enhance the eyes. Make them brighter and more brilliant, increase the sharpness of the iris, and remove any distracting red blood vessels.",
                    skin_teeth: "Naturally whiten the teeth. Remove any yellow cast without making them look artificial.",
                    fabric: "Enhance the texture and details of the fabric in the clothing. Make the patterns and weaves more distinct.",
                    backdrop: "Clean the background. Remove any dust, scratches, or distracting elements from the backdrop to create a clean, uniform look.",
                };
                
                const selectedFixes = Object.entries(manualFixes)
                    .filter(([, isSelected]) => isSelected)
                    .map(([key]) => fixPrompts[key]);

                if (selectedFixes.length > 0) {
                    promptToUse = `Task: Perform a professional, high-quality edit on the provided image. Focus on these corrections: ${selectedFixes.join(' ')}. The final result must look natural and high-quality. ${presetPrompt}`;
                } else {
                    promptToUse = `Task: Perform a professional, automatic enhancement of this photograph. Analyze and correct any issues with lighting, color, sharpness, and composition to produce a high-quality, natural-looking result. ${presetPrompt}`;
                }
                break;
        }
        imagesToUse = imagesToUse.length > 0 ? imagesToUse : (presetImages[0] || []);
    }

    // Add a high-priority, non-negotiable instruction to maintain the aspect ratio.
    if (imagesToUse.length > 0) {
        let sourceImageForAspectRatio: ReferenceImage | undefined;

        // Special case for background replacement: match the new background's aspect ratio.
        if (selectedPreset === 'background' && presetImages[1]?.[0]) {
            sourceImageForAspectRatio = presetImages[1][0];
        } else {
            // Default to the first image in the list (the primary subject/source image).
            sourceImageForAspectRatio = imagesToUse[0];
        }
        
        if (sourceImageForAspectRatio) {
            aspectInstruction = `**ABSOLUTE RULE: The final output image's aspect ratio MUST EXACTLY MATCH the source image's aspect ratio (${sourceImageForAspectRatio.width}:${sourceImageForAspectRatio.height}).** This is a non-negotiable instruction. Preserve the original framing. The task is as follows:\n\n`;
        }
    }

    // Prepend the instruction to the final prompt for maximum priority.
    promptToUse = aspectInstruction + promptToUse;

    if ((!promptToUse.trim() && imagesToUse.length === 0) || isGeneratingImage) return;

    setIsGeneratingImage(true); 
    setError(''); 
    setGeneratedImage(undefined); 
    startProgressSimulation(setGenerateProgress, imagesToUse.length > 0 ? 12000 : 20000); 
    setGenerationTime(0); 
    if(timerInterval.current) clearInterval(timerInterval.current); 
    timerInterval.current = setInterval(() => { setGenerationTime(prev => prev + 1); }, 1000);

    try { 
      const resultBase64 = await generateImage(promptToUse, imagesToUse); 
      triggerHapticFeedback();
      const dimensions = await getImageDimensions(resultBase64);
      const newImage: GeneratedImage = { base64: resultBase64, ...dimensions };
      setGeneratedImage(newImage); 
      
      const historyItem: HistoryItem = {
          id: Date.now(),
          base64: resultBase64,
          prompt: promptToUse,
          ...dimensions
      };
      setHistory(prev => [historyItem, ...prev].slice(0, HISTORY_LIMIT));

    } catch (err) { 
      setError(handleApiError(err)); 
    } finally { 
      stopProgressSimulation(setGenerateProgress); 
      setIsGeneratingImage(false); 
      if(timerInterval.current) clearInterval(timerInterval.current); 
    }
  }, [mode, enhancedPrompt, originalPrompt, images, selectedPreset, presetOptions, presetPrompt, presetImages, isGeneratingImage, t, handleApiError, manualFixes]);
  
  const handleDownloadImage = useCallback((imageToDownload: string) => { 
    const promptForFilename = enhancedPrompt.trim() || originalPrompt.trim() || presetPrompt || selectedPreset || 'generated';
    if (!imageToDownload) return; 
    const link = document.createElement('a'); 
    link.href = `data:image/png;base64,${imageToDownload}`; 
    const safeFilename = promptForFilename.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 50); 
    link.download = `${safeFilename || 'generated_image'}.png`; 
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link); 
  }, [enhancedPrompt, originalPrompt, presetPrompt, selectedPreset]);
  
    const handleCopyImage = useCallback((imageToCopy: string) => {
        if (!imageToCopy || !navigator.clipboard?.write) return;
        const byteCharacters = atob(imageToCopy);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/png' });
        
        navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]).then(() => {
            triggerHapticFeedback();
            setIsResultCopied(true);
            setTimeout(() => setIsResultCopied(false), 2000);
        }).catch(err => {
            console.error('Failed to copy image:', err);
        });
    }, []);

  const handleGetSuggestions = useCallback(async () => {
    if ((!originalPrompt.trim() && images.length === 0) || isSuggesting) {
        if (!originalPrompt.trim() && images.length === 0) setSuggestionError(t('errorPromptOrImageRequired'));
        return;
    }
    setIsSuggesting(true); setSuggestionError(''); setAiSuggestions([]); startProgressSimulation(setSuggestionProgress, 5000);
    try { const suggestions = await getPromptSuggestions(originalPrompt, language, images); setAiSuggestions(suggestions); } catch (err) { setSuggestionError(handleApiError(err)); } finally { stopProgressSimulation(setSuggestionProgress); setIsSuggesting(false); }
  }, [originalPrompt, images, isSuggesting, language, t, handleApiError]);
    
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const isTyping = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

        // Hotkeys that should work even when typing
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'enter':
                    e.preventDefault();
                    if (activeView === 'create') {
                        handleGenerateImageClick();
                    }
                    break;
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleGenerateImageClick, activeView]);

  // Initial view mode detection
  useEffect(() => {
    const checkViewMode = () => {
        if (window.innerWidth < 1024) { // Collapse to single column below lg breakpoint
            setViewMode('mobile');
        } else {
            setViewMode('pc');
        }
    };
    checkViewMode();
    window.addEventListener('resize', checkViewMode);
    return () => window.removeEventListener('resize', checkViewMode);
  }, []);

  const isPresetReady = () => {
    if (!selectedPreset) return false;
    const imgCount1 = presetImages[0]?.length || 0;
    const imgCount2 = presetImages[1]?.length || 0;

    switch (selectedPreset) {
      case 'restore':
      case 'relight':
      case 'passport':
      case 'edit':
        return imgCount1 >= 1;
      case 'style':
        return imgCount1 >= 1 && !!presetOptions.style;
      case 'background':
      case 'clothing':
      case 'color_match':
        return imgCount1 >= 1 && imgCount2 >= 1;
      default:
        return false;
    }
  };
  
    const presets = [
    { id: 'restore', label: t('presetRestore') },
    { id: 'relight', label: t('presetRelight') },
    { id: 'style', label: t('presetStyle') },
    { id: 'background', label: t('presetBackground') },
    { id: 'clothing', label: t('presetClothing') },
    { id: 'passport', label: t('presetPassport') },
    { id: 'edit', label: t('presetEdit') },
    { id: 'color_match', label: t('presetColorMatch') },
  ];
  
  const handlePresetSelect = (presetId: string) => {
    setSelectedPreset(presetId);
    setPresetImages([[]]); // Reset images
    setPresetOptions({});
    setPresetPrompt('');
    setGeneratedImage(undefined);
    setError('');
    // Reset edit-specific state
    setIsAnalyzing(false);
    setAnalysisProgress(0);
    setDetectedIssues([]);
    setManualFixes(initialManualFixes);
    setAnalysisError('');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sendMenuRef.current && !sendMenuRef.current.contains(event.target as Node)) {
        setActiveSendMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSendImage = (img: { base64: string; width: number; height: number }, destination: string) => {
      triggerHapticFeedback();
      const referenceImage: ReferenceImage = {
          ...img,
          mimeType: 'image/png',
          name: `sent_${Date.now()}.png`
      };

      if (destination === 'pro') {
          setMode('pro');
          setActiveView('create');
          setImages(prev => [...prev, referenceImage]);
          window.scrollTo(0, 0);
      } else {
          setMode('presets');
          setActiveView('create');
          // Important: select preset first, which resets state
          handlePresetSelect(destination);
          
          // Then, in the next render cycle, set the image
          setTimeout(() => {
              setPresetImages(prev => {
                const newImages = [...prev];
                newImages[0] = [referenceImage]; // Always set to the first slot
                return newImages;
              });
              window.scrollTo(0, 0);
          }, 0);
      }
      setActiveSendMenu(null);
  };
  
  const commonInputClass = "w-full p-3 bg-[var(--input-bg-color)] border border-[var(--input-border-color)] rounded-lg focus:ring-2 focus:ring-[var(--primary-color)] focus:border-[var(--primary-color)] transition-all duration-300 shadow-inner shadow-black/20 placeholder-[var(--input-placeholder-color)] text-[var(--text-color)]";
  const hudPanelClass = "hud-border rounded-xl shadow-lg p-4 space-y-3";
  
  const handlePresetImageChange = (index: number, single: boolean = false) => (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    const setter = (updater: React.SetStateAction<ReferenceImage[]>) => {
        setPresetImages(prev => {
            const newImages = [...prev];
            const currentSlot = newImages[index] || [];
            newImages[index] = typeof updater === 'function' ? updater(currentSlot) : updater;
            return newImages;
        });
    };
    handleFiles(event.target.files, setter, !single);
  };
  
  const ImageUploadSlot = ({ index, label, single = false }: { index: number, label: string, single?: boolean }) => {
    const setter = (updater: React.SetStateAction<ReferenceImage[]>) => {
        setPresetImages(prev => {
            const newImages = [...prev];
            const currentSlot = newImages[index] || [];
            newImages[index] = typeof updater === 'function' ? updater(currentSlot) : updater;
            return newImages;
        });
    };

    return (
      <div className={hudPanelClass}>
        <label className="block text-sm font-medium text-center text-[var(--text-color)] mb-1">{label}</label>
        <div onDrop={(e) => handleDrop(e, setter, !single, index)} onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); setActiveDropzone(index); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => {setIsDragging(false); setActiveDropzone(null);}} className={`relative p-2 border-2 border-dashed rounded-lg transition-all duration-300 min-h-[120px] ${isDragging && activeDropzone === index ? 'dropzone-active' : 'border-[var(--input-border-color)]'}`}>
          <input type="file" id={`preset-img-upload-${index}`} accept="image/*,.heic,.heif" onChange={handlePresetImageChange(index, single)} className="sr-only" multiple={!single} />
          <input type="file" id={`preset-img-camera-${index}`} accept="image/*,.heic,.heif" capture="environment" onChange={handlePresetImageChange(index, single)} className="sr-only" multiple={!single} />
          {(!presetImages[index] || presetImages[index].length === 0) ? (
            <div className="w-full flex flex-col items-center justify-center py-6 space-y-2">
              <div className="flex items-center justify-center gap-3">
                <label htmlFor={`preset-img-upload-${index}`} title={t('uploadMessage').split(',')[2]} className="flex flex-col items-center cursor-pointer p-2 rounded-lg hover:bg-white/10">
                  <UploadIcon className="w-8 h-8 text-[var(--text-color-muted)]"/>
                  <span className="text-xs text-[var(--text-color-muted)] mt-1">{t('uploadMessage').split(',')[2]}</span>
                </label>
                <label htmlFor={`preset-img-camera-${index}`} title={t('cameraButton')} className="flex flex-col items-center cursor-pointer p-2 rounded-lg hover:bg-white/10">
                  <CameraIcon className="w-8 h-8 text-[var(--text-color-muted)]"/>
                  <span className="text-xs text-[var(--text-color-muted)] mt-1">{t('cameraButton')}</span>
                </label>
              </div>
              <p className="text-[var(--text-color-muted)] text-center text-xs pt-2">{t('uploadMessage').split(',').slice(0,2).join(',')}</p>
            </div>
          ) : (
             <div className="flex flex-wrap gap-2">
                {presetImages[index].map((img, i) => (
                    <div key={i} className="relative group w-20 h-20">
                        <img src={`data:${img.mimeType};base64,${img.base64}`} onClick={() => setFullscreenRefImage(img)} className="w-full h-full object-cover rounded-md cursor-pointer transition-transform group-hover:scale-105"/>
                        <button onClick={() => setPresetImages(p => { const n = [...p]; n[index] = n[index].filter((_, idx) => idx !== i); return n; })} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100">&times;</button>
                        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-sm">{`${img.width}x${img.height}`}</div>
                    </div>
                ))}
                 {!single && (
                    <label htmlFor={`preset-img-upload-${index}`} className="flex items-center justify-center w-20 h-20 border-2 border-dashed border-[var(--input-border-color)] rounded-lg cursor-pointer hover:bg-[var(--input-bg-color)] hover:border-[var(--primary-color)] transition-colors">
                        <span className="text-2xl text-[var(--text-color-muted)]">+</span>
                    </label>
                 )}
             </div>
          )}
        </div>
      </div>
    );
  }

  const renderPresetUI = () => {
    if (!selectedPreset) return <p className="text-center text-[var(--text-color-muted)]">{t('selectAPreset')}</p>;
    
    switch(selectedPreset) {
      case 'restore': return <div className="space-y-4">
          <ImageUploadSlot index={0} label={t('uploadOldPhoto')} single={true} />
          <div className={`${hudPanelClass} !p-3`}>
              <div className="flex items-center space-x-4">
                  <label className="flex items-center"><input type="checkbox" checked={!!presetOptions.restoreDetails} onChange={e => setPresetOptions(o => ({...o, restoreDetails: e.target.checked}))} className="mr-2" /> {t('restoreDetails')}</label>
                  <label className="flex items-center"><input type="checkbox" checked={!!presetOptions.recolor} onChange={e => setPresetOptions(o => ({...o, recolor: e.target.checked}))} className="mr-2" /> {t('recolor')}</label>
              </div>
          </div>
        </div>;
      case 'relight': return <div className="space-y-4">
          <ImageUploadSlot index={0} label={t('uploadImageToRelight')} single={true} />
          <div className={hudPanelClass}>
              <label className="block text-sm font-medium">{t('lightStyle')}</label>
              <select value={presetOptions.lightStyle || ''} onChange={e => setPresetOptions(o => ({...o, lightStyle: e.target.value}))} className={commonInputClass}>
                  <option value="">{t('automaticDetection')}</option>
                  {currentPresetOptions.lightingStyles.map(style => <option key={style} value={style}>{style}</option>)}
              </select>
          </div>
           <div className={hudPanelClass}>
              <label className="block text-sm font-medium">{t('lightDirection')}</label>
               <select value={presetOptions.lightDirection || ''} onChange={e => setPresetOptions(o => ({...o, lightDirection: e.target.value}))} className={commonInputClass}>
                  <option value="">{t('automaticDetection')}</option>
                  {currentPresetOptions.lightDirections.map(dir => <option key={dir} value={dir}>{dir}</option>)}
              </select>
          </div>
        </div>;
      case 'style': return <div className="space-y-4">
          <ImageUploadSlot index={0} label={t('uploadImageToRestyle')} single={true} />
           <div className={hudPanelClass}>
              <label className="block text-sm font-medium">{t('selectStyle')}</label>
              <select value={presetOptions.style || ''} onChange={e => setPresetOptions(o => ({...o, style: e.target.value}))} className={commonInputClass}>
                  <option value="" disabled>{t('selectStylePlaceholder')}</option>
                  {currentPresetOptions.artStyles.map(style => <option key={style} value={style}>{style}</option>)}
              </select>
          </div>
        </div>;
      case 'background': return <div className="space-y-4">
          <ImageUploadSlot index={0} label={t('uploadSubject')} single={true} />
          <ImageUploadSlot index={1} label={t('uploadBackground')} single={true} />
        </div>;
      case 'clothing': return <div className="space-y-4">
          <ImageUploadSlot index={0} label={t('uploadModel')} single={true} />
          <ImageUploadSlot index={1} label={t('uploadClothing')} />
        </div>;
      case 'passport': return <div className="space-y-4">
          <ImageUploadSlot index={0} label={t('uploadPortrait')} single={true} />
          <div className={hudPanelClass}>
            <label className="block text-sm font-medium">{t('selectOutfit')}</label>
            <select value={presetOptions.outfit || ''} onChange={e => setPresetOptions(o => ({...o, outfit: e.target.value}))} className={commonInputClass}>
                <option value="">{t('automaticDetection')}</option>
                {currentPresetOptions.passportOutfits.map(outfit => <option key={outfit} value={outfit}>{outfit}</option>)}
            </select>
          </div>
          <div className={hudPanelClass}>
            <label className="block text-sm font-medium">{t('selectBackgroundColor')}</label>
            <select value={presetOptions.bgColor || ''} onChange={e => setPresetOptions(o => ({...o, bgColor: e.target.value}))} className={commonInputClass}>
                <option value="">{t('automaticDetection')}</option>
                {currentPresetOptions.passportBackgrounds.map(color => <option key={color} value={color}>{color}</option>)}
            </select>
          </div>
        </div>;
       case 'color_match': return <div className="space-y-4">
          <ImageUploadSlot index={0} label={t('uploadSourceImage')} single={true} />
          <ImageUploadSlot index={1} label={t('uploadReferenceImage')} single={true} />
        </div>;
       case 'edit': return <div className="space-y-4">
          <ImageUploadSlot index={0} label={t('uploadImageToEdit')} single={true} />
        </div>;
      default: return null;
    }
  };

  const renderPresetInspector = () => {
    
    if (selectedPreset === 'edit') {
        return (
            <div className={`${hudPanelClass} space-y-4`}>
              <button onClick={handleAnalyzeImage} disabled={isAnalyzing || !presetImages[0] || presetImages[0].length === 0} className="w-full flex items-center justify-center bg-[var(--button-secondary-bg)] hover:brightness-110 text-[var(--button-secondary-text)] font-bold py-2 px-4 rounded-lg transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg active:scale-95 btn-hover-effect">
                {isAnalyzing ? `${t('analyzingImage')} (${analysisProgress}%)` : t('analyzeImageButton')}
              </button>
              
              <div className="p-3 min-h-[60px] bg-black/10 dark:bg-black/30 border border-[var(--input-border-color)] rounded-lg">
                <h3 className="text-sm font-semibold text-[var(--text-color-muted)] mb-2">{t('detectedIssues')}</h3>
                {isAnalyzing && <ProgressBar progress={analysisProgress} label={t('analyzingImage')} translate={t} />}
                {analysisError && <p className="text-red-500 dark:text-red-400 text-sm">{analysisError}</p>}
                {!isAnalyzing && !analysisError && detectedIssues.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {detectedIssues.map(issue => <span key={issue} className="px-2 py-0.5 bg-[var(--tag-bg)] text-[var(--tag-text)] text-xs rounded-full">{t(`issue_${issue}` as TranslationKeys)}</span>)}
                    </div>
                )}
                {!isAnalyzing && !analysisError && detectedIssues.length === 0 && <p className="text-[var(--text-color-muted)] text-xs">{t('noIssuesDetected')}</p>}
              </div>

              <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-color-muted)] mb-2">{t('manualFixes')}</h3>
                    <label className="flex items-center cursor-pointer p-2 bg-sky-500/10 dark:bg-cyan-500/10 rounded-lg border border-sky-500/30 dark:border-cyan-500/40">
                        <input
                            type="checkbox"
                            checked={manualFixes['professionalize']}
                            onChange={e => setManualFixes(f => ({ ...f, professionalize: e.target.checked }))}
                            className="mr-3 h-5 w-5 rounded-md border-gray-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="text-md font-bold text-sky-700 dark:text-cyan-300">{t(`fix_professionalize` as TranslationKeys)}</span>
                    </label>
                </div>
                
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {['composition', 'lighting', 'colors', 'sharpness', 'noise', 'chromatic_aberration', 'shadows', 'highlights', 'contrast'].map(fixKey => (
                        <label key={fixKey} className="flex items-center cursor-pointer">
                            <input type="checkbox" checked={manualFixes[fixKey]} onChange={e => setManualFixes(f => ({ ...f, [fixKey]: e.target.checked }))} className="mr-2 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"/>
                            <span className="text-sm text-[var(--text-color)]">{t(`fix_${fixKey}` as TranslationKeys)}</span>
                        </label>
                    ))}
                </div>

                <div>
                    <h3 className="text-sm font-semibold text-[var(--text-color-muted)] mt-4 mb-2 border-t border-[var(--panel-border-color)] pt-3">{t('skinRetouching')}</h3>
                     <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {['skin_heal', 'skin_tone', 'skin_mattify', 'skin_dodge_burn', 'skin_eyes', 'skin_teeth', 'fabric', 'backdrop'].map(fixKey => (
                            <label key={fixKey} className="flex items-center cursor-pointer">
                                <input type="checkbox" checked={manualFixes[fixKey]} onChange={e => setManualFixes(f => ({ ...f, [fixKey]: e.target.checked }))} className="mr-2 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"/>
                                <span className="text-sm text-[var(--text-color)]">{t(`fix_${fixKey}` as TranslationKeys)}</span>
                            </label>
                        ))}
                    </div>
                </div>
              </div>
            </div>
        );
    }
    
    return null;
  };
  
  const staggeredAnimation = (delay: number) => ({ animation: 'scan-in 0.6s cubic-bezier(0.25, 1, 0.5, 1) forwards', animationDelay: `${delay}s`, opacity: 0 });

  const hasEnhanced = enhancedPrompt.trim().length > 0;
  const hasOriginal = originalPrompt.trim().length > 0;
  const canGenerate = (hasEnhanced || hasOriginal) && !isLoading && !isGeneratingImage;
  const generateButtonText = isGeneratingImage ? `${t('generatingImageButton')} (${generateProgress}%)` : hasEnhanced ? t('generateWithEnhanced') : t('generateWithOriginal');
  
  const Navigation = () => {
    const navItems = [
      { id: 'create', label: t('createTab'), icon: <BrushIcon className="w-6 h-6"/> },
      { id: 'history', label: t('historyTab'), icon: <HistoryIcon className="w-6 h-6"/> },
      { id: 'guide', label: t('guideTab'), icon: <BookOpenIcon className="w-6 h-6"/> },
    ];
    
    if(viewMode === 'pc') {
      return (
        <div className="mb-6 flex justify-center bg-[var(--panel-bg-color)] p-1 rounded-xl border border-[var(--panel-border-color)]" style={staggeredAnimation(0.15)}>
            {navItems.map(item => (
                <button key={item.id} onClick={() => setActiveView(item.id as View)} className={`w-40 py-2 text-center rounded-lg transition-all ${activeView === item.id ? 'bg-[var(--primary-color)] text-[var(--button-primary-text)] shadow-lg' : 'hover:bg-white/10'}`}>
                    {item.label}
                </button>
            ))}
        </div>
      );
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-[var(--panel-bg-color)]/80 backdrop-blur-md border-t border-[var(--panel-border-color)] z-40 flex justify-around items-center">
            {navItems.map(item => (
                <button key={item.id} onClick={() => setActiveView(item.id as View)} className={`flex flex-col items-center justify-center transition-colors ${activeView === item.id ? 'text-[var(--primary-color)]' : 'text-[var(--text-color-muted)] hover:text-[var(--primary-color)]'}`}>
                    {item.icon}
                    <span className="text-xs mt-1">{item.label}</span>
                </button>
            ))}
        </div>
    );
  }

  const Guide = () => (
      <div className="max-w-4xl mx-auto space-y-8 animate-scan-in">
          <div className={`${hudPanelClass} p-6`}>
              <h2 className="text-3xl font-bold text-center text-[var(--primary-color)] mb-2">{t('guideTitle')}</h2>
              <p className="text-center text-[var(--text-color-muted)]">{t('guideIntro')}</p>
          </div>

          <div className={`${hudPanelClass} p-6`}>
              <h3 className="text-2xl font-semibold mb-4 text-[var(--secondary-color)]">{t('guideProModeTitle')}</h3>
              <p className="mb-4">{t('guideProModeDesc')}</p>
              <ul className="space-y-4 list-inside">
                  <li><strong>{t('guideProModeStep1')}</strong> {t('guideProModeStep1Desc')}</li>
                  <li><strong>{t('guideProModeStep2')}</strong> {t('guideProModeStep2Desc')}</li>
                  <li><strong>{t('guideProModeStep3')}</strong> {t('guideProModeStep3Desc')}</li>
                  <li><strong>{t('guideProModeStep4')}</strong> {t('guideProModeStep4Desc')}</li>
              </ul>
          </div>
          
          <div className={`${hudPanelClass} p-6`}>
              <h3 className="text-2xl font-semibold mb-4 text-[var(--secondary-color)]">{t('guideQuickPresetsTitle')}</h3>
              <p className="mb-4">{t('guideQuickPresetsDesc')}</p>
              <ul className="space-y-2 list-disc list-inside">
                  <li>{t('guidePresetRestore')}</li>
                  <li>{t('guidePresetRelight')}</li>
                  <li>{t('guidePresetStyle')}</li>
                  <li>{t('guidePresetBackground')}</li>
                  <li>{t('guidePresetClothing')}</li>
                  <li>{t('guidePresetPassport')}</li>
                  <li>{t('guidePresetEdit')}</li>
                  <li>{t('guidePresetColorMatch')}</li>
              </ul>
          </div>

          <div className={`${hudPanelClass} p-6`}>
              <h3 className="text-2xl font-semibold mb-4 text-[var(--secondary-color)]">{t('guideHistoryTitle')}</h3>
              <p className="mb-4">{t('guideHistoryDesc')}</p>
              <p>{t('guideHistoryFeatures')}</p>
          </div>

          <div className="text-center text-[var(--text-color-muted)] pt-4">
              <p>{t('guideFinalWords')}</p>
          </div>
      </div>
  );

  const MainMenu = () => (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <div className="space-y-6 max-w-2xl w-full">
            <div className="flex justify-center mb-4" style={staggeredAnimation(0)}>
                <LogoIcon className="w-56 h-56 text-[var(--primary-color)] animate-logo-pulse" />
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-[var(--primary-color)] tracking-widest uppercase animate-title-float" style={staggeredAnimation(0.2)}>
                {t('mainMenuTitle')}
            </h1>
            <p className="text-lg md:text-xl text-[var(--text-color-muted)]" style={staggeredAnimation(0.4)}>
                {t('mainMenuSubtitle')}
            </p>
            <button
                onClick={() => setShowMainMenu(false)}
                className="w-full max-w-xs mx-auto bg-[var(--button-primary-bg)] hover:brightness-110 text-[var(--button-primary-text)] font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-lg active:scale-95 btn-hover-effect text-xl animate-button-pulse"
                style={staggeredAnimation(0.6)}
            >
                {t('mainMenuButton')}
            </button>
        </div>
    </div>
  );

  if (showMainMenu && !isApiModalOpen) {
      return <MainMenu />;
  }

  return (
    <>
      <ApiKeyModal 
        isOpen={isApiModalOpen} 
        onSave={handleSaveApiKey} 
        translate={t}
        onClose={() => setIsApiModalOpen(false)}
        showCloseButton={isAppReady}
      />

      {isAppReady && (
        <div className={`min-h-screen ${viewMode !== 'pc' ? 'pb-20' : ''}`}>
          <div className="container mx-auto px-4 py-8">
            <header className="flex flex-wrap justify-between items-center gap-4 mb-4 border-b border-[var(--panel-border-color)] pb-4" style={staggeredAnimation(0.1)}>
                <div className="flex items-center gap-4">
                  <LogoIcon className="w-16 h-16 text-[var(--primary-color)]"/>
                  <h1 className="text-3xl md:text-4xl font-bold text-[var(--primary-color)] tracking-widest uppercase animate-text-glow">{t('mainMenuTitle')}</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <div className="hidden lg:flex items-center bg-[var(--panel-bg-color)] border border-[var(--panel-border-color)] rounded-lg p-0.5">
                      <button onClick={() => setViewMode('mobile')} title={t('viewModeMobile')} className={`p-1.5 rounded-md transition-all ${viewMode === 'mobile' ? 'bg-[var(--primary-color)] text-[var(--button-primary-text)]' : 'hover:bg-white/10'}`}><DevicePhoneMobileIcon className="w-5 h-5"/></button>
                      <button onClick={() => setViewMode('pc')} title={t('viewModePC')} className={`p-1.5 rounded-md transition-all ${viewMode === 'pc' ? 'bg-[var(--primary-color)] text-[var(--button-primary-text)]' : 'hover:bg-white/10'}`}><ComputerDesktopIcon className="w-5 h-5"/></button>
                    </div>
                    <button onClick={() => setLanguage('en')} className={`px-3 py-1 text-sm rounded-lg transition-all duration-300 btn-hover-effect ${language === 'en' ? 'bg-[var(--primary-color)] text-[var(--button-primary-text)] shadow-[0_0_15px_var(--primary-color-glow)]' : 'bg-[var(--panel-bg-color)] hover:brightness-125 border border-[var(--panel-border-color)]'}`}>EN</button>
                    <button onClick={() => setLanguage('vi')} className={`px-3 py-1 text-sm rounded-lg transition-all duration-300 btn-hover-effect ${language === 'vi' ? 'bg-[var(--primary-color)] text-[var(--button-primary-text)] shadow-[0_0_15px_var(--primary-color-glow)]' : 'bg-[var(--panel-bg-color)] hover:brightness-125 border border-[var(--panel-border-color)]'}`}>VI</button>
                    <button onClick={toggleTheme} title={theme === 'dark' ? t('switchToLight') : t('switchToDark')} className="p-2 rounded-lg transition-all duration-300 btn-hover-effect bg-[var(--panel-bg-color)] hover:brightness-125 border border-[var(--panel-border-color)]">
                      {theme === 'dark' ? <SunIcon className="w-5 h-5 text-yellow-400" /> : <MoonIcon className="w-5 h-5 text-slate-700" />}
                    </button>
                    <button onClick={() => setIsApiModalOpen(true)} title={t('manageApiKeyButton')} className="p-2 rounded-lg transition-all duration-300 btn-hover-effect bg-[var(--panel-bg-color)] hover:brightness-125 border border-[var(--panel-border-color)]">
                        <KeyIcon className="w-5 h-5 text-[var(--text-color-muted)]" />
                    </button>
                </div>
            </header>
            
            <Navigation />
            
            <main>
              {/* --- CREATE VIEW --- */}
              {activeView === 'create' && (
                <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6`}>
                  {/* --- LEFT COLUMN (CONTROLS) --- */}
                  <div className={`lg:col-span-3 space-y-6`}>
                      <div className={hudPanelClass} style={staggeredAnimation(0.15)}>
                          <div className="flex bg-[var(--panel-bg-color)] p-1 rounded-xl border border-[var(--panel-border-color)]">
                              <button onClick={() => setMode('pro')} className={`w-1/2 py-2 text-center rounded-lg transition-all ${mode === 'pro' ? 'bg-[var(--primary-color)] text-[var(--button-primary-text)] shadow-lg' : 'hover:bg-white/10'}`}>{t('proMode')}</button>
                              <button onClick={() => setMode('presets')} className={`w-1/2 py-2 text-center rounded-lg transition-all ${mode === 'presets' ? 'bg-[var(--primary-color)] text-[var(--button-primary-text)] shadow-lg' : 'hover:bg-white/10'}`}>{t('presetsMode')}</button>
                          </div>
                      </div>

                      {mode === 'pro' && (
                        <div className={hudPanelClass} style={staggeredAnimation(0.2)}>
                            <div className="space-y-4">
                              <div>
                                <label htmlFor="model-select" className="block text-lg font-medium mb-2 text-[var(--text-color)]">{t('targetModelLabel')}</label>
                                <select id="model-select" value={model} onChange={(e) => setModel(e.target.value as ImageModel)} className={commonInputClass}>
                                  {Object.values(ImageModel).map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>
                              <div>
                                <label htmlFor="length-select" className="block text-lg font-medium mb-2 text-[var(--text-color)]">{t('desiredLengthLabel')}</label>
                                <select id="length-select" value={length} onChange={(e) => setLength(e.target.value as PromptLength)} className={commonInputClass}>
                                  {Object.values(PromptLength).map((l) => <option key={l} value={l}>{t(l as TranslationKeys)}</option>)}
                                </select>
                              </div>
                            </div>
                        </div>
                      )}

                      {mode === 'presets' && (
                          <div className={hudPanelClass} style={staggeredAnimation(0.2)}>
                            <label className="block text-lg font-medium text-[var(--text-color)] mb-2">{t('selectAPreset')}</label>
                            <div className="grid grid-cols-2 gap-2">
                                {presets.map(preset => (
                                    <button 
                                      key={preset.id} 
                                      onClick={() => handlePresetSelect(preset.id)} 
                                      className={`p-3 text-center rounded-lg font-semibold btn-preset-neon ${presetColorClasses[preset.id] || ''} ${selectedPreset === preset.id ? 'active' : ''}`}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                          </div>
                      )}
                  </div>

                  {/* --- CENTER COLUMN (WORKSPACE) --- */}
                  <div className={`lg:col-span-5 space-y-6`}>
                    {mode === 'pro' && (
                        <>
                           <div className={hudPanelClass} style={staggeredAnimation(0.2)}>
                              <div className="flex justify-between items-baseline">
                                  <div>
                                    <label className="text-lg font-medium text-[var(--text-color)]">{t('referenceImageLabel')}</label>
                                    {images.length === 1 && <p className="text-xs text-[var(--text-color-muted)]">{t('referenceImageLabelSingle')}</p>}
                                    {images.length > 1 && <p className="text-xs text-[var(--text-color-muted)]">{t('referenceImageLabelMulti')}</p>}
                                  </div>
                                  {images.length > 0 && ( <button onClick={() => setImages([])} className="flex items-center space-x-1.5 text-sm text-red-500 hover:text-red-400 transition-colors btn-hover-effect"> <TrashIcon className="w-4 h-4" /> <span>{t('clearAllButton')}</span> </button> )}
                              </div>
                              <div onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={(e) => handleDrop(e, setImages, true)} className={`relative p-4 border-2 border-dashed rounded-xl transition-all duration-300 ${isDragging ? 'dropzone-active' : 'border-[var(--input-border-color)] hover:border-[var(--primary-color)]'}`}>
                                <input type="file" id="image-upload" accept="image/*,.heic,.heif" onChange={(e) => handleFiles(e.target.files, setImages)} className="sr-only" multiple/>
                                <input type="file" id="camera-upload" accept="image/*,.heic,.heif" capture="environment" onChange={(e) => handleFiles(e.target.files, setImages)} className="sr-only" multiple/>
                                {images.length === 0 ? (
                                    <div className="w-full flex flex-col items-center justify-center py-12 space-y-2">
                                      <div className="flex items-center justify-center gap-4 sm:gap-6">
                                        <label htmlFor="image-upload" title={t('uploadMessage').split(',')[2]} className="flex flex-col items-center cursor-pointer p-2 rounded-lg hover:bg-white/10">
                                            <UploadIcon className="w-10 h-10 text-[var(--text-color-muted)]"/>
                                            <span className="text-xs text-[var(--text-color-muted)] mt-1">{t('uploadMessage').split(',')[2]}</span>
                                        </label>
                                        <label htmlFor="camera-upload" title={t('cameraButton')} className="flex flex-col items-center cursor-pointer p-2 rounded-lg hover:bg-white/10">
                                            <CameraIcon className="w-10 h-10 text-[var(--text-color-muted)]"/>
                                            <span className="text-xs text-[var(--text-color-muted)] mt-1">{t('cameraButton')}</span>
                                        </label>
                                      </div>
                                      <p className="text-[var(--text-color-muted)] text-center pt-2">{t('uploadMessage').split(',').slice(0,2).join(',')}</p>
                                    </div>
                                ) : (
                                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                      {images.map((img, index) => (
                                          <div key={index} className="relative group aspect-square">
                                              <img src={`data:${img.mimeType};base64,${img.base64}`} alt={img.name} className="w-full h-full object-cover rounded-lg shadow-lg cursor-pointer transition-transform group-hover:scale-105 border-2 border-transparent group-hover:border-[var(--primary-color)]" onClick={() => setFullscreenRefImage(img)} />
                                              <button onClick={() => setImages(prev => prev.filter((_, i) => i !== index))} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-500 scale-100 hover:scale-110 transition-all duration-200 opacity-0 group-hover:opacity-100">&times;</button>
                                              <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-sm">{`${img.width}x${img.height}`}</div>
                                              {index === 0 && <div className="absolute bottom-1 left-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded-full border border-cyan-400/50">Base</div>}
                                          </div>
                                      ))}
                                      <label htmlFor="image-upload" className="flex items-center justify-center aspect-square border-2 border-dashed border-[var(--input-border-color)] rounded-lg cursor-pointer hover:bg-[var(--input-bg-color)] hover:border-[var(--primary-color)] transition-colors"> <span className="text-3xl text-[var(--text-color-muted)]">+</span> </label>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className={hudPanelClass} style={staggeredAnimation(0.3)}>
                              <label htmlFor="prompt-input" className="block text-lg font-medium text-[var(--text-color)]">{t('yourPromptLabel')}</label>
                              <textarea id="prompt-input" value={originalPrompt} onChange={(e) => setOriginalPrompt(e.target.value)} placeholder={t('yourPromptPlaceholder')} rows={5} className={commonInputClass}/>
                            </div>
                            <button onClick={handleEnhanceClick} disabled={!originalPrompt.trim() || isLoading || isGeneratingImage} className="w-full flex items-center justify-center bg-[var(--button-primary-bg)] hover:brightness-110 text-[var(--button-primary-text)] font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg active:scale-95 btn-hover-effect">
                              {isLoading ? `${t('enhancingButton')} (${enhanceProgress}%)` : t('enhanceButton')}
                            </button>
                        </>
                    )}
                    {mode === 'presets' && (
                      <div className="space-y-6">
                          {renderPresetUI()}
                          {selectedPreset &&
                            <div className={hudPanelClass}>
                                <label htmlFor="preset-prompt" className="block text-lg font-medium text-[var(--text-color)]">{t('optionalPrompt')}</label>
                                <textarea id="preset-prompt" value={presetPrompt} onChange={(e) => setPresetPrompt(e.target.value)} placeholder={t('optionalPromptPlaceholder')} rows={2} className={commonInputClass}/>
                            </div>
                           }
                           {selectedPreset && 
                            <button onClick={handleGenerateImageClick} disabled={!isPresetReady() || isGeneratingImage} className="w-full flex items-center justify-center bg-[var(--button-primary-bg)] hover:brightness-110 text-[var(--button-primary-text)] font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg active:scale-95 btn-hover-effect">
                                {isGeneratingImage ? `${t('generatingImageButton')} (${generateProgress}%)` : t('applyPreset')}
                            </button>
                           }
                      </div>
                    )}
                  </div>
                  
                  {/* --- RIGHT COLUMN (INSPECTOR & OUTPUT) --- */}
                  <div className={`lg:col-span-4 space-y-6`}>
                    {mode === 'pro' && (
                        <>
                           <div className={hudPanelClass} style={staggeredAnimation(0.4)}>
                              <div className="flex justify-between items-center">
                                  <label className="text-lg font-medium text-[var(--text-color)]">{t('aiSuggestionsTitle')}</label>
                                  <button onClick={handleGetSuggestions} disabled={isSuggesting || (!originalPrompt.trim() && images.length === 0)} className="flex items-center space-x-2 text-sm px-3 py-1.5 bg-[var(--button-secondary-bg)] hover:brightness-110 text-[var(--button-secondary-text)] rounded-lg transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg active:scale-95 btn-hover-effect">
                                      {isSuggesting ? ( <><span>{t('suggestingButton')}</span><span className="text-xs">({suggestionProgress}%)</span></>) : (aiSuggestions.length > 0 ? <RefreshIcon className="w-4 h-4" /> : <SparklesIcon className="w-4 h-4" />)}
                                      {!isSuggesting && <span>{aiSuggestions.length > 0 ? t('refreshSuggestionsButton') : t('getSuggestionsButton')}</span>}
                                  </button>
                              </div>
                              <div className="p-3 min-h-[80px] flex flex-wrap gap-2 items-center justify-center bg-black/10 dark:bg-black/30 border border-[var(--input-border-color)] rounded-lg">
                                  {isSuggesting && <ProgressBar progress={suggestionProgress} label={t('suggestingButton')} tip={currentTip} translate={t}/>}
                                  {suggestionError && <p className="text-red-500 dark:text-red-400 text-sm">{suggestionError}</p>}
                                  {!isSuggesting && !suggestionError && aiSuggestions.length > 0 && (aiSuggestions.map((suggestion, index) => (<button key={index} onClick={() => handleAddTag(suggestion)} className="px-3 py-1 bg-[var(--tag-bg)] text-[var(--tag-text)] text-sm rounded-full shadow-md hover:bg-[var(--tag-hover-bg)] hover:text-[var(--tag-hover-text)] hover:scale-105 active:scale-95 transition-all duration-200">{suggestion}</button>)))}
                                  {!isSuggesting && !suggestionError && aiSuggestions.length === 0 && <p className="text-[var(--text-color-muted)] text-sm text-center">{t('suggestionsPlaceholder')}</p>}
                              </div>
                            </div>
                            <div className={hudPanelClass} style={staggeredAnimation(0.5)}>
                                <h2 className="text-lg font-medium text-[var(--text-color)]">{t('enhancedPromptTitle')}</h2>
                                <div className="relative bg-black/10 dark:bg-black/30 rounded-lg p-4 border border-[var(--input-border-color)] min-h-[164px] flex items-center justify-center">
                                  {isLoading && <ProgressBar progress={enhanceProgress} label={t('enhancingButton')} tip={currentTip} translate={t} />}
                                  {error && <div className="text-red-500 dark:text-red-400 text-center"><p className="font-bold">{t('errorPrefix')}</p><p>{error}</p></div>}
                                  {enhancedPrompt && !isLoading && (
                                      <>
                                        <div className="absolute top-3 right-3 flex items-center space-x-2">
                                            <button onClick={() => setEnhancedPrompt('')} title={t('clearEnhancedPromptButton')} className="p-2 bg-[var(--input-bg-color)] hover:bg-red-500/20 dark:hover:bg-red-500/30 rounded-lg transition-all btn-hover-effect group">
                                              <CloseIcon className="w-5 h-5 text-[var(--text-color-muted)] group-hover:text-red-400 transition-colors" />
                                            </button>
                                            <button onClick={handleCopyToClipboard} title={isCopied ? t('copiedButton') : t('copyButton')} className="p-2 bg-[var(--input-bg-color)] hover:brightness-95 dark:hover:brightness-125 rounded-lg transition-all btn-hover-effect">
                                                {isCopied ? <CheckIcon className="w-5 h-5 text-green-500" /> : <CopyIcon className="w-5 h-5 text-[var(--text-color-muted)]" />}
                                            </button>
                                        </div>
                                        <p className="text-lg whitespace-pre-wrap break-words w-full h-full overflow-y-auto pr-24">{enhancedPrompt}</p>
                                      </>
                                  )}
                                  {!isLoading && !error && !enhancedPrompt && <p className="text-[var(--text-color-muted)]">{t('resultPlaceholder')}</p>}
                                </div>
                            </div>
                             <div className={hudPanelClass} style={staggeredAnimation(0.6)}>
                                <button onClick={handleGenerateImageClick} disabled={!canGenerate} className="w-full flex items-center justify-center bg-[var(--button-secondary-bg)] hover:brightness-110 text-[var(--button-secondary-text)] font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg active:scale-95 btn-hover-effect">
                                  {generateButtonText}
                                </button>
                             </div>
                        </>
                    )}
                    
                    {mode === 'presets' && (
                      <div className="space-y-6">
                        <div style={staggeredAnimation(0.3)}>
                            {renderPresetInspector()}
                        </div>
                      </div>
                    )}
                    {(
                         <div className={hudPanelClass} style={staggeredAnimation(0.7)}>
                            <h2 className="text-lg font-medium text-[var(--text-color)]">{t('generatedImageTitle')}</h2>
                            <div className="relative w-full aspect-square bg-black/10 dark:bg-black/30 rounded-lg p-1 border border-[var(--input-border-color)] flex flex-col items-center justify-center">
                                {isGeneratingImage && (
                                    <div className='w-full text-center'>
                                        <ProgressBar progress={generateProgress} label={t('generatingImageButton')} tip={currentTip} translate={t}/>
                                        <p className="text-sm text-slate-600 dark:text-cyan-200/80 mt-3 tracking-widest">{t('generationTimeLabel')}: {generationTime}s</p>
                                    </div>
                                )}
                                {error && <div className="text-red-500 dark:text-red-400 text-center p-4"><p className="font-bold">{t('errorPrefix')}</p><p>{error}</p></div>}
                                {!generatedImage && !isGeneratingImage && !error && (
                                    <div className="text-center text-[var(--text-color-muted)] p-4 space-y-3">
                                        <CompassIcon className="w-16 h-16 mx-auto text-[var(--text-color-muted)]/50"/>
                                        <p>{t('generatedImagePlaceholder')}</p>
                                    </div>
                                )}
                                
                                {images.length > 0 && generatedImage && mode === 'pro' && (
                                    <ImageComparator beforeImage={images[0]} afterImage={generatedImage} />
                                )}
                                {presetImages[0]?.[0] && generatedImage && mode === 'presets' && selectedPreset && ['restore', 'relight', 'style', 'passport', 'edit', 'color_match'].includes(selectedPreset) && (
                                    <ImageComparator beforeImage={presetImages[0][0]} afterImage={generatedImage} />
                                )}
                                
                                 {generatedImage && (
                                    (!images.length && mode === 'pro') ||
                                    (mode === 'presets' && (!presetImages[0]?.[0] || !selectedPreset || !['restore', 'relight', 'style', 'passport', 'edit', 'color_match'].includes(selectedPreset)))
                                ) && (
                                    <img src={`data:image/png;base64,${generatedImage.base64}`} alt={t('generatedImageTitle')} className="w-full h-full object-contain" />
                                )}


                                {generatedImage && (
                                    <div className="absolute top-2 right-2 flex flex-col space-y-2 z-10">
                                        <button onClick={() => setMainResultViewerOpen(true)} title={t('fullscreenButton')} className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition-all btn-hover-effect">
                                            <FullscreenIcon className="w-5 h-5 text-white" />
                                        </button>
                                        <button onClick={() => handleDownloadImage(generatedImage.base64)} title={t('downloadButton')} className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition-all btn-hover-effect">
                                            <DownloadIcon className="w-5 h-5 text-white" />
                                        </button>
                                        <button onClick={() => handleCopyImage(generatedImage.base64)} title={isResultCopied ? t('copiedButton') : t('copyResultButton')} className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition-all btn-hover-effect">
                                            {isResultCopied ? <CheckIcon className="w-5 h-5 text-green-400" /> : <ClipboardIcon className="w-5 h-5 text-white" />}
                                        </button>
                                        <div className="relative">
                                            <button onClick={() => setActiveSendMenu(activeSendMenu === 'generated' ? null : 'generated')} title={t('sendToPresetButton')} className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition-all btn-hover-effect">
                                                <SendIcon className="w-5 h-5 text-white" />
                                            </button>
                                            {activeSendMenu === 'generated' && (
                                                <div ref={sendMenuRef} className="absolute right-full mr-2 top-0 w-48 bg-[var(--panel-bg-color)] border border-[var(--panel-border-color)] rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                                                    <button onClick={() => handleSendImage(generatedImage, 'pro')} className="w-full text-left px-4 py-2 text-sm hover:bg-white/10">{t('sendToProMode')}</button>
                                                    <div className="border-t border-[var(--panel-border-color)] my-1"></div>
                                                    {presets.map(preset => (
                                                        <button key={preset.id} onClick={() => handleSendImage(generatedImage, preset.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-white/10">{preset.label}</button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                  </div>
                </div>
              )}

              {/* --- HISTORY VIEW --- */}
              {activeView === 'history' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">{t('historyTitle')}</h2>
                    {history.length > 0 && (
                      <button onClick={() => setHistory([])} className="flex items-center space-x-1.5 text-sm text-red-500 hover:text-red-400 transition-colors btn-hover-effect">
                        <TrashIcon className="w-4 h-4" />
                        <span>{t('clearAllButton')}</span>
                      </button>
                    )}
                  </div>
                  {history.length === 0 ? (
                    <div className="text-center py-16 text-[var(--text-color-muted)]">
                      <HistoryIcon className="w-20 h-20 mx-auto mb-4 text-[var(--text-color-muted)]/50"/>
                      <p>{t('historyEmpty')}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                      {history.map((item, index) => (
                        <div key={item.id} className="relative group hud-border rounded-xl overflow-hidden shadow-lg animate-[fadeIn_0.5s_ease-out] transition-all duration-300 hover:shadow-cyan-400/20 hover:-translate-y-1">
                          <img
                            src={`data:image/png;base64,${item.base64}`}
                            alt={item.prompt.slice(0, 50)}
                            className="w-full h-auto aspect-square object-cover cursor-pointer"
                            onClick={() => setHistoryViewerIndex(index)}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                            <p className="text-white text-xs line-clamp-3">{item.prompt}</p>
                          </div>
                           <div className="absolute top-2 right-2 flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <button onClick={() => setHistoryViewerIndex(index)} title={t('fullscreenButton')} className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition-all btn-hover-effect">
                                <FullscreenIcon className="w-5 h-5 text-white" />
                              </button>
                              <button onClick={() => handleDownloadImage(item.base64)} title={t('downloadButton')} className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition-all btn-hover-effect">
                                <DownloadIcon className="w-5 h-5 text-white" />
                              </button>
                              <div className="relative">
                                <button onClick={() => setActiveSendMenu(activeSendMenu === `${item.id}` ? null : `${item.id}`)} title={t('sendToPresetButton')} className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition-all btn-hover-effect">
                                  <SendIcon className="w-5 h-5 text-white" />
                                </button>
                                {activeSendMenu === `${item.id}` && (
                                  <div ref={sendMenuRef} className="absolute right-0 mt-2 w-48 bg-[var(--panel-bg-color)] border border-[var(--panel-border-color)] rounded-lg shadow-lg z-20 max-h-60 overflow-y-auto">
                                    <button onClick={() => handleSendImage(item, 'pro')} className="w-full text-left px-4 py-2 text-sm hover:bg-white/10">{t('sendToProMode')}</button>
                                    <div className="border-t border-[var(--panel-border-color)] my-1"></div>
                                    {presets.map(preset => (
                                      <button key={preset.id} onClick={() => handleSendImage(item, preset.id)} className="w-full text-left px-4 py-2 text-sm hover:bg-white/10">{preset.label}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button onClick={() => setHistory(h => h.filter(h => h.id !== item.id))} title={t('deleteFromHistoryButton')} className="p-2 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg transition-all btn-hover-effect">
                                  <TrashIcon className="w-5 h-5 text-white" />
                              </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
               {/* --- GUIDE VIEW --- */}
               {activeView === 'guide' && <Guide />}
            </main>
          </div>
          <ImageZoomViewer isOpen={!!fullscreenRefImage} imageUrl={fullscreenRefImage ? `data:${fullscreenRefImage.mimeType};base64,${fullscreenRefImage.base64}` : ''} altText={fullscreenRefImage?.name || ''} onClose={() => setFullscreenRefImage(null)} />
          <ImageZoomViewer 
            isOpen={mainResultViewerOpen} 
            imageUrl={generatedImage ? `data:image/png;base64,${generatedImage.base64}` : ''} 
            altText={t('generatedImageTitle')} 
            onClose={() => setMainResultViewerOpen(false)} 
          />
          <ImageZoomViewer 
              isOpen={historyViewerIndex !== null}
              imageUrl={historyViewerIndex !== null ? `data:image/png;base64,${history[historyViewerIndex].base64}` : ''}
              altText={historyViewerIndex !== null ? history[historyViewerIndex].prompt : ''}
              onClose={() => setHistoryViewerIndex(null)}
              showNavigation={true}
              onNext={() => setHistoryViewerIndex(i => (i !== null ? (i + 1) % history.length : null))}
              onPrev={() => setHistoryViewerIndex(i => (i !== null ? (i - 1 + history.length) % history.length : null))}
          />
        </div>
      )}
    </>
  );
}

// FIX: Added default export for the App component.
// This resolves the error in index.tsx where it couldn't find a default export.
export default App;