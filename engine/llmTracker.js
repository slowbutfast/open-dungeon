let activeCalls = []; // Array of { id, type, prompt, status, timestamp, duration, response, error }
let debugLogs = [];
let nextCallId = 1;

export const llmTracker = {
    startCall(type, promptOrMessages) {
        const id = nextCallId++;
        const call = {
            id,
            type, // 'narration', 'summarization', 'extraction', 'opening_scene', 'embedding', 'embedding_batch'
            prompt: typeof promptOrMessages === 'string' ? promptOrMessages : JSON.stringify(promptOrMessages, null, 2),
            status: 'active',
            timestamp: new Date().toISOString(),
            duration: null,
            response: null,
            error: null
        };
        activeCalls.push(call);
        if (activeCalls.length > 50) {
            activeCalls.shift();
        }
        return id;
    },

    endCall(id, responseText = null) {
        const call = activeCalls.find(c => c.id === id);
        if (call) {
            call.status = 'completed';
            call.duration = Date.now() - new Date(call.timestamp).getTime();
            call.response = typeof responseText === 'string' ? responseText : JSON.stringify(responseText, null, 2);
        }
    },

    failCall(id, error) {
        const call = activeCalls.find(c => c.id === id);
        if (call) {
            call.status = 'failed';
            call.duration = Date.now() - new Date(call.timestamp).getTime();
            call.error = error?.message || String(error);
        }
    },

    getCalls() {
        return activeCalls;
    },

    clear() {
        activeCalls = [];
    }
};

export function addDebugLog(msg) {
    debugLogs.push({
        timestamp: new Date().toLocaleTimeString(),
        message: msg
    });
    if (debugLogs.length > 100) {
        debugLogs.shift();
    }
}

export function getDebugLogs() {
    return debugLogs;
}

export function clearDebugLogs() {
    debugLogs = [];
}
