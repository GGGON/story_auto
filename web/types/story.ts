export interface Character {
  id: string;
  name: string;
  bio: string;
  traits: string[];
}

export interface Option {
  id: string;
  label: string;
  next_action_hint: string; // Used to guide the AI for the next generation
}

export interface EducationItem {
  question: string; // The point or question
  answer: string;   // The explanation or reference answer
}

export interface EducationContent {
  knowledge_points: EducationItem[];
  thinking_questions: EducationItem[];
}

export interface StoryNode {
  id: string;
  summary: string; // Internal summary for context
  content: string; // The visible story text
  options: Option[];
  character_id: string; // The perspective character
  image_prompt?: string;
  image_url?: string;
  education?: EducationContent;
  
  // For Reader Mode & Hybrid Mode
  source_segment_id?: string; // ID of the original text segment this node is derived from
  interactive_version_id?: string; // ID of the interactive version of this node (if this is a reader node)
  reader_version_id?: string; // ID of the reader version (if this is an interactive node)
}

export interface GameState {
  characters: Character[];
  history: StoryNode[];
  currentNode: StoryNode | null;
  maxNodes: number;
  mode?: "interactive" | "reader"; // Game mode
  storySequence?: StoryNode[]; // Pre-calculated sequence for reader mode
}
