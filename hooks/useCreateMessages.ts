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

            await new Promise(resolve => setTimeout(resolve, 500));

            await loadMessages();
            
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
    }, [projectId, loadMessages]);

    return { mutateAsync, isPending, messages, loadMessages };
};