import { pipeline, env } from '@xenova/transformers';

// Skip local model checks, pull directly from HuggingFace CDN into browser cache
env.allowLocalModels = false;

class PipelineSingleton {
    static task = 'text2text-generation';
    // FLAN-T5-small is highly optimized for instruction following and is ~80MB
    static model = 'Xenova/flan-t5-small';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (this.instance === null) {
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

// Listen for messages from the main React UI
self.addEventListener('message', async (event) => {
    const text = event.data.text;

    try {
        // Load the AI (will trigger progress updates on first load)
        const generator = await PipelineSingleton.getInstance(x => {
            self.postMessage({ status: 'loading', data: x });
        });

        // The exact prompt to force the AI to act as a compiler
        const prompt = `Extract only the specific programming languages and technical skills from this sentence. Ignore all conversational words. Sentence: "${text}"`;

        const output = await generator(prompt, {
            max_new_tokens: 20,
            temperature: 0.1, // Keep it highly deterministic
        });

        // Send the compiled keywords back to the UI
        self.postMessage({ 
            status: 'complete', 
            compiledQuery: output[0].generated_text 
        });

    } catch (error) {
        self.postMessage({ status: 'error', error: error.message });
    }
});