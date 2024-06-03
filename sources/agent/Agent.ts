import * as React from 'react';
import { AsyncLock } from "../utils/lock";
import { imageDescription, llamaFind, openAIFind } from "./imageDescription";
import { startAudio } from '../modules/openai';

type AgentState = {
    lastDescription?: string;
    lastAudioDescription?: string;
    answer?: string;
    loading: boolean;
}

export class Agent {
    #lock = new AsyncLock();
    #photos: { photo: Uint8Array, description: string }[] = [];
    #audios: { audio: Uint8Array, description: string }[] = [];
    #state: AgentState = { loading: false };
    #stateCopy: AgentState = { loading: false };
    #stateListeners: (() => void)[] = [];

    async addPhoto(photos: Uint8Array[]) {
        await this.#lock.inLock(async () => {

            // Append photos
            let lastDescription: string | null = null;
            for (let p of photos) {
                console.log('Processing photo', p.length);
                let description = await imageDescription(p);
                console.log('Description', description);
                this.#photos.push({ photo: p, description });
                lastDescription = description;
            }

            // TODO: Update summaries

            // Update UI
            if (lastDescription) {
                this.#state.lastDescription = lastDescription;
                this.#notify();
            }
        });
    }

    async addAudio(audios: Uint8Array[]) {
        await this.#lock.inLock(async () => {

            // Append audios
            let lastDescription: string | null = null;
            for (let p of audios) {
                console.log('Processing audio', p.length);
                let description = '~ '+p.length//await imageDescription(p);
                console.log('Description', description);
                this.#audios.push({ audio: p, description });
                lastDescription = description;
            }

            // TODO: Update summaries

            // Update UI
            if (lastDescription) {
                this.#state.lastAudioDescription = lastDescription;
                this.#notify();
            }
        });
    }

    async answer(question: string) {
        console.log('answer ...', question)
        try {
            startAudio()
        } catch(error) {
            console.log("Failed to start audio")
        }
        if (this.#state.loading) {
            return;
        }
        this.#state.loading = true;
        this.#notify();
        await this.#lock.inLock(async () => {
            let combined = '';
            let i = 0;
            for (let p of this.#photos) {
                combined + '\n\nImage #' + i + '\n\n';
                combined += p.description;
                i++;
            }
            // let answer = await llamaFind(question, combined);
            let answer = await openAIFind(question, combined);
            console.log('openAIFind answer ...', answer)
            this.#state.answer = answer;
            this.#state.loading = false;
            this.#notify();
        });
    }

    #notify = () => {
        this.#stateCopy = { ...this.#state };
        for (let l of this.#stateListeners) {
            l();
        }
    }


    use() {
        const [state, setState] = React.useState(this.#stateCopy);
        React.useEffect(() => {
            const listener = () => setState(this.#stateCopy);
            this.#stateListeners.push(listener);
            return () => {
                this.#stateListeners = this.#stateListeners.filter(l => l !== listener);
            }
        }, []);
        return state;
    }
}