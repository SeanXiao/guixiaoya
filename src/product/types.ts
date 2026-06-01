export type PromptRecord = {
  id: string;
  type: "story" | "image" | "culture" | "system";
  label: string;
  prompt: string;
  output: string;
  createdAt: string;
};

export type BookLanguage = "zh" | "en";

export type ProtagonistGender = "girl" | "boy";

export type PictureBookPage = {
  pageNumber: number;
  title: string;
  text: string;
  imagePrompt: string;
  imageUrl: string;
  imageSource: "bailian" | "placeholder";
  cultureNote: string;
  speechAudioUrl?: string;
  speechAudioText?: string;
  speechAudioVoice?: string;
  speechAudioLanguage?: BookLanguage;
};

export type PictureBook = {
  id: string;
  title: string;
  subtitle: string;
  originalIdea: string;
  language?: BookLanguage;
  protagonistGender?: ProtagonistGender;
  createdAt: string;
  updatedAt: string;
  heritageElements: string[];
  tourismElements: string[];
  guidingQuestions: string[];
  outline: string;
  pages: PictureBookPage[];
  tourGuideScript: string;
  studentReflection: string;
  aiContentRatio: number;
  promptRecords: PromptRecord[];
};

export type PictureBookSummary = {
  id: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  language?: BookLanguage;
  protagonistGender?: ProtagonistGender;
  heritageElements: string[];
  tourismElements: string[];
  coverImageUrl: string;
};
