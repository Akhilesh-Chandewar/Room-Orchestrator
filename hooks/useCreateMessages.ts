import { useState, useCallback } from "react";

type MessageData = {
    _id: string;
    role: "user" | "assistant";
    content: string;
    type?: "TEXT" | "ERROR" | "RESULT";
    createdAt: string;
};

type UseCreateMessagesReturn = {
    mutateAsync: (content: string) => Promise<void>;
    isPending: boolean;
    messages: MessageData[];
    loadMessages: () => Promise<void>;
};

export const useCreateMessages = (projectId?: string): UseCreateMessagesReturn => {
    const [isPending, setIsPending] = useState(false);
    const [messages, setMessages] = useState<MessageData[]>([]);

    const loadMessages = useCallback(async () => {
        try {
            const response = await fetch(`/api/messages${projectId ? `?projectId=${projectId}` : ""}`, {
                method: "GET",
            });
            if (response.ok) {
                const data = await response.json();
                setMessages(data.messages || []);
            }
        } catch (error) {
            console.error("Failed to load messages:", error);
        }
    }, [projectId]);

    const pollForResponse = useCallback(async () => {
        for (let i = 0; i < 15; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await loadMessages();
            const msgs = await (await fetch(`/api/messages${projectId ? `?projectId=${projectId}` : ""}`)).json();
            if (msgs.messages && msgs.messages.length > messages.length) {
                setMessages(msgs.messages);
                return true;
            }
        }
        return false;
    }, [loadMessages, messages.length, projectId]);

    const mutateAsync = useCallback(async (content: string) => {
        setIsPending(true);
        
        const userMsg: MessageData = {
            _id: `temp-${Date.now()}`,
            role: "user",
            content,
            createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, userMsg]);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: content,
                    roomId: projectId || `room-${Date.now()}`,
                    projectId: projectId || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Failed to send message");
            }

            const hasResponse = await pollForResponse();
            
            if (!hasResponse) {
                const timeoutMsg: MessageData = {
                    _id: `timeout-${Date.now()}`,
                    role: "assistant",
                    content: "⏳ Request is taking longer than expected. Please check again in a moment.",
                    type: "TEXT",
                    createdAt: new Date().toISOString(),
                };
                setMessages(prev => [...prev, timeoutMsg]);
            }
            
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : "Failed to process request";
            
            const errorMessage: MessageData = {
                _id: `error-${Date.now()}`,
                role: "assistant",
                content: errorMsg,
                type: "ERROR",
                createdAt: new Date().toISOString(),
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsPending(false);
        }
    }, [projectId, pollForResponse]);

    return { mutateAsync, isPending, messages, loadMessages };
};