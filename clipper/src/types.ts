export interface ClipOptions {
  url: string;
  template?: string;
  tags?: string[];
  folder?: string;
  note?: string;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface ClipResult {
  filePath: string;
  title: string;
  wordCount: number;
  processingTimeMs: number;
}

export interface ExtractedContent {
  title: string;
  author: string;
  description: string;
  domain: string;
  published: string;
  wordCount: number;
  contentHtml: string;
}

export interface ConvertedContent extends ExtractedContent {
  contentMarkdown: string;
}

export interface ClipTemplate {
  name: string;
  triggers?: string[];
  folder: string;
  fileNameFormat: string;
  frontmatter: Record<string, unknown>;
  noteContent: string;
}

export interface AppConfig {
  vaultPath: string;
  browserTimeoutMs: number;
  jinaFallback: boolean;
  jinaTimeoutMs: number;
  logLevel: string;
  port: number;
}
