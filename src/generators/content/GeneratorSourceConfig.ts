export interface GeneratorSourceCollection {
    [generatorName: string]: GeneratorSourceConfig;
}

export interface GeneratorSourceConfig {
    generatorType?: string;
    sourceFile?: string;
    values?: string[];
    condition?: string;
    switchValues?: { [name: string]: string | string[] };
    sources?: GeneratorSourceCollection;
}

export enum GeneratorSourceType {
    Basic = "basic",
    Import = "import",
    Markov = "markov",
    Multiline = "multiline",
    Switch = "switch"
}