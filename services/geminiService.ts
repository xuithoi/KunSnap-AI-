

import { GoogleGenAI, Modality, Part, Type } from "@google/genai";
import { ImageModel, PromptLength, ReferenceImage } from '../types';

let ai: GoogleGenAI | null = null;

// This function acts as a singleton factory for the GoogleGenAI client.
// It ensures that the client is initialized only once and handles key retrieval.
const getAiClient = (): GoogleGenAI => {
    if (ai) {
        return ai;
    }

    // 1. Prioritize AI Studio's environment variable.
    const apiKeyFromEnv = process.env.API_KEY;
    // 2. Fallback to localStorage for local execution.
    const apiKeyFromStorage = localStorage.getItem('user_api_key');

    const apiKey = apiKeyFromEnv || apiKeyFromStorage;

    if (!apiKey) {
        // 3. If no key is found, throw a specific error for the UI to handle.
        throw new Error('API_KEY_MISSING');
    }

    ai = new GoogleGenAI({ apiKey });
    return ai;
};

/**
 * Saves a user-provided API key to localStorage and re-initializes the client.
 * @param key The user's API key.
 */
export const saveAndInitializeApiKey = (key: string) => {
    localStorage.setItem('user_api_key', key);
    // Reset the current client instance so it gets re-created with the new key on next call.
    ai = null;
};


const modelDescriptions: Record<ImageModel, string> = {
    [ImageModel.FLUX]: "State-of-the-art for photorealism and detail. It understands natural language exceptionally well. Use descriptive, full sentences. Focus on details like lighting, textures, camera settings (e.g., 'shot on 70mm film, f/2.8'). Avoid simple tag lists.",
    [ImageModel.SD1_5]: "A versatile and classic model. It responds very well to comma-separated keywords, artist names ('style of Greg Rutkowski'), and specific art styles ('Art Deco', 'Cyberpunk'). It's less adept at complex sentences than Flux.",
    [ImageModel.FLUX_KONTEXT]: "Specialized for extremely long and narrative prompts. Perfect for telling a story or describing a highly complex scene with multiple subjects and interactions. The more detailed the narrative, the better.",
    [ImageModel.QWEN_IMAGE]: "Excels at anime, manga, and illustrative styles. Also has a unique ability to generate legible text within images. When prompting for this model, specify Asian aesthetics or artistic styles clearly.",
    [ImageModel.FLUX_KREA]: "Tuned for creative, artistic, and often surreal outputs. It responds well to abstract concepts, emotional language, and unconventional combinations. Don't be afraid to be poetic and imaginative.",
    [ImageModel.QWEN_IMAGE_EDIT]: "Designed specifically for editing. Requires a reference image and a clear, direct instruction. Use imperative commands like 'Change the background to a beach', 'Make the shirt red', 'Add a hat on his head'.",
};

const lengthInstructions: Record<PromptLength, string> = {
    [PromptLength.SHORT]: "a concise but powerful prompt, around 15-25 words.",
    [PromptLength.MEDIUM]: "a detailed prompt, around 40-60 words, adding more context, style cues, and composition details.",
    [PromptLength.LONG]: "a very descriptive, complex prompt, 80+ words, specifying intricate details about lighting, camera angles, art style, textures, and mood.",
};

export const enhancePrompt = async (
  originalPrompt: string,
  model: ImageModel,
  length: PromptLength,
  images?: ReferenceImage[]
): Promise<string> => {
  try {
    const client = getAiClient();
    const systemPrompt = `You are a world-class prompt engineer, a master at crafting the perfect text-to-image prompt. Your task is to transform a user's basic idea into a high-performance prompt, meticulously tailored for the specific target model: **${model}**.

**Target Model Deep-Dive:**
- **Model:** **${model}**
- **Characteristics & Optimal Phrasing:** ${modelDescriptions[model]}

**User's Request:**
- **Base Idea:** "${originalPrompt}"
- **Desired Length:** ${length}
${images && images.length > 0 ? '- **Reference Images:** The user has provided images for context, style, or subject guidance.' : ''}

**Your Mission:**
1.  **Deconstruct the Input:** Deeply analyze the user's base idea ${images && images.length > 0 ? 'and the visual cues from the reference images' : ''}. Identify the core subject, intent, and any implied style.
2.  **Strategize for the Model:** Based on the **${model}** characteristics above, choose the best prompting strategy. Will you use natural language sentences, comma-separated tags, artist names, or a narrative description?
3.  **Craft the Master Prompt:** Rewrite and expand the prompt. Infuse it with rich, evocative vocabulary. Add layers of detail regarding:
    *   **Subject:** Poses, expressions, clothing, specific features.
    *   **Environment:** Setting, atmosphere, weather.
    *   **Lighting:** Type (e.g., cinematic, soft, neon), direction, time of day (e.g., golden hour).
    *   **Composition:** Camera angle (e.g., low angle, wide shot), lens (e.g., 85mm, macro), depth of field.
    *   **Style:** Art medium (e.g., oil painting, 3D render), artistic movement, specific artist styles that align with the model's strengths.
    *   **Quality:** Keywords like 'masterpiece', 'highly detailed', '4K'.
4.  **Adhere to Constraints:** Ensure the final prompt aligns with the desired length: ${lengthInstructions[length]}.
5.  **Language & Formatting:** The final prompt **MUST** be in English. Structure it using the optimal phrasing for **${model}** (e.g., sentences for Flux, tags for SD1.5).
6.  **Final Output:** Your response must be **ONLY** the final, enhanced prompt. No commentary, no explanations, no introductory phrases. Just the pure, ready-to-use prompt.`;
    
    const parts: Part[] = [{ text: systemPrompt }];
    if (images && images.length > 0) {
        images.forEach(image => {
            parts.push({
                inlineData: {
                    data: image.base64,
                    mimeType: image.mimeType,
                },
            });
        });
    }

    const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("Error enhancing prompt:", error);
    if (error instanceof Error) {
        throw error;
    }
    throw new Error("An unknown error occurred while enhancing the prompt.");
  }
};


export const generateImage = async (
  prompt: string,
  images?: ReferenceImage[]
): Promise<string> => {
  try {
    const client = getAiClient();
    // Case 1: Text-to-Image Generation (no reference images)
    if (!images || images.length === 0) {
      const response = await client.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: prompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: '1:1',
        },
      });
      if (response.generatedImages && response.generatedImages.length > 0) {
        return response.generatedImages[0].image.imageBytes;
      }
      throw new Error("The model did not return an image from the text prompt.");
    }
    
    // Case 2: Image Editing/Generation with reference images.
    const parts: Part[] = [];
    
    // Add all provided images first. The model needs the visual context before the instruction.
    images.forEach(image => {
        parts.push({
            inlineData: {
                data: image.base64,
                mimeType: image.mimeType
            }
        });
    });

    // The text prompt is crucial as it contains the instructions on how to use the images.
    parts.push({ text: prompt });

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }

    // If no image is returned, construct a detailed error message.
    const finishReason = response.candidates?.[0]?.finishReason;
    const blockReason = response.promptFeedback?.blockReason;

    if (finishReason === 'PROHIBITED_CONTENT' || finishReason === 'SAFETY' || blockReason) {
        throw new Error('ERROR_PROMPT_REJECTED');
    }

    if (response.text) {
        throw new Error(response.text);
    }
    
    if (finishReason && finishReason !== 'STOP') {
        throw new Error(`Generation failed. Reason: ${finishReason}.`);
    }

    throw new Error("The model did not return an image. It may have refused the prompt.");

  } catch (error) {
    console.error("Error generating image:", error);
    if (error instanceof Error) {
        throw error;
    }
    throw new Error("An unknown error occurred while generating the image.");
  }
};

export const getPromptSuggestions = async (currentPrompt: string, language: 'en' | 'vi', images?: ReferenceImage[]): Promise<string[]> => {
    try {
        const client = getAiClient();
        const languageInstruction = language === 'vi' 
            ? `**QUAN TRỌNG**: Chỉ trả về một mảng JSON hợp lệ chứa các chuỗi tiếng Việt. Không bao gồm bất kỳ văn bản, giải thích, hoặc định dạng markdown nào khác.`
            : `**IMPORTANT**: Return ONLY a valid JSON array of strings in English. Do not include any other text, explanations, or markdown formatting.`;

        const systemPrompt = `You are a creative assistant specializing in text-to-image prompt brainstorming. Your primary task is to deeply analyze the user's input—which may include a text prompt and/or reference images—and provide a list of 8-10 highly relevant, short, evocative keywords or phrases.

**Analysis Process:**
1.  **Analyze the Images (if provided):** Scrutinize the reference images for their core elements: subject, style (e.g., photorealistic, anime, watercolor), color palette, lighting (e.g., golden hour, neon), and composition. Your suggestions should stem directly from these visual cues.
2.  **Analyze the Text Prompt (if provided):** Examine the user's text for keywords and intent.
3.  **Synthesize:** Combine insights from both the images and text to generate complementary and additive ideas. The suggestions must be logically connected to the provided input.

**User's Input:**
-   **Current Prompt:** "${currentPrompt}"
-   **Reference Images:** Images are attached to this request if the user provided them.

**Output Instructions:**
1.  Keep each suggestion concise (1-5 words).
2.  The suggestions should be diverse, covering style, setting, lighting, detail, etc., but always relevant.
3.  ${languageInstruction}

Example (English, with image of a cat and prompt "a cat"):
["in a cyberpunk city", "impressionist oil painting", "wearing a wizard hat", "cinematic lighting", "glowing magical aura"]

Example (Vietnamese, with image of a cat and prompt "một con mèo"):
["trong thành phố cyberpunk", "tranh sơn dầu ấn tượng", "đội mũ phù thủy", "ánh sáng điện ảnh", "hào quang ma thuật phát sáng"]`;

        const parts: Part[] = [{ text: systemPrompt }];
        if (images && images.length > 0) {
            images.forEach(image => {
                parts.push({
                    inlineData: {
                        data: image.base64,
                        mimeType: image.mimeType,
                    },
                });
            });
        }
        
        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts },
            config: {
                responseMimeType: "application/json",
            },
        });
        
        const suggestions = JSON.parse(response.text);

        if (Array.isArray(suggestions) && suggestions.every(s => typeof s === 'string')) {
            return suggestions;
        } else {
            throw new Error("AI response was not a valid array of strings.");
        }

    } catch (error) {
        console.error("Error getting prompt suggestions:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while getting suggestions.");
    }
};

export type ImageIssue = 
    "POOR_COMPOSITION" | "UNBALANCED_LIGHTING" | "DULL_COLORS" | "BLURRY_OR_SOFT" | 
    "IMAGE_NOISE" | "CHROMATIC_ABERRATION" | "HARSH_SHADOWS" | "WASHED_OUT_HIGHLIGHTS" | 
    "LOW_CONTRAST" | "OVERSATURATED_COLORS" | "UNEVEN_SKIN_TONE" | "SKIN_BLEMISHES" | 
    "OILY_SKIN_SHINE" | "DULL_EYES" | "YELLOW_TEETH";

export const analyzeImageForIssues = async (image: ReferenceImage): Promise<ImageIssue[]> => {
    try {
        const client = getAiClient();
        const systemPrompt = `You are an expert photo analysis AI. Analyze the user's image and identify common photographic problems. Your response MUST be a valid JSON array containing strings from the following list ONLY: ["POOR_COMPOSITION", "UNBALANCED_LIGHTING", "DULL_COLORS", "BLURRY_OR_SOFT", "IMAGE_NOISE", "CHROMATIC_ABERRATION", "HARSH_SHADOWS", "WASHED_OUT_HIGHLIGHTS", "LOW_CONTRAST", "OVERSATURATED_COLORS", "UNEVEN_SKIN_TONE", "SKIN_BLEMISHES", "OILY_SKIN_SHINE", "DULL_EYES", "YELLOW_TEETH"]. If the image is good quality and has no major issues, return an empty array. Do not add any explanation or other text.`;

        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { text: systemPrompt },
                    {
                        inlineData: {
                            data: image.base64,
                            mimeType: image.mimeType,
                        },
                    },
                ],
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING,
                    },
                },
            },
        });

        const issues = JSON.parse(response.text) as ImageIssue[];

        if (Array.isArray(issues) && issues.every(s => typeof s === 'string')) {
            return issues;
        } else {
            throw new Error("AI response was not a valid array of issue strings.");
        }

    } catch (error) {
        console.error("Error analyzing image issues:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while analyzing the image.");
    }
};