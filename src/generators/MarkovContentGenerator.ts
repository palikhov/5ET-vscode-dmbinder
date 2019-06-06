import { BaseContentGenerator } from "./BaseContentGenerator";
import { GeneratorSourceConfig } from "../models/GeneratorSource";
import { MarkovChain } from "../models/MarkovChain";

export class MarkovContentGenerator extends BaseContentGenerator {
    private _chainCache: MarkovChain;

    constructor(generatorSource: GeneratorSourceConfig) {
        super(generatorSource);
        this._chainCache = new MarkovChain();
        if (this._source.values && this._source.values.length) {
            this._chainCache.buildChain(this._source.values);
        }
    }

    public generate(): string {
        var wordCount = this._chainCache.selectWordCount();
        var results: string[] = [];

        for (var i = 0; i < wordCount; i++) {
            var wordLength = this._chainCache.selectWordLength();
            var word = this._chainCache.selectInitialCharacter();

            while (word.length < wordLength) {
                word += this._chainCache.selectLink(word.charAt(word.length - 1));
            }
            results.push(word);
        }
        return results.join(" ");
    }
}