import { useState, useCallback, useRef } from "react";

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

export const useCreateMessages = (): UseCreateMessagesReturn => {
    const [isPending, setIsPending] = useState(false);
    const [messages, setMessages] = useState<MessageData[]>([]);
    const baselineRef = useRef<string[]>([]);

    const loadMessages = useCallback(async () => {
        try {
            const response = await fetch("/api/messages", {
                method: "GET",
            });
            if (response.ok) {
                const data = await response.json();
                const msgs: MessageData[] = data.messages || [];
                setMessages(msgs);
                baselineRef.current = msgs.map((m: MessageData) => m._id);
            }
        } catch (error) {
            console.error("Failed to load messages:", error);
        }
    }, []);

    const pollForResponse = useCallback(async () => {
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                const response = await fetch("/api/messages");
                const data = await response.json();
                const msgs: MessageData[] = data.messages || [];
                
                const baselineIds = baselineRef.current;
                const newMessages = msgs.filter((m: MessageData) => !baselineIds.includes(m._id));
                const hasNewAssistant = newMessages.some((m: MessageData) => m.role === "assistant");
                
                if (hasNewAssistant) {
                    setMessages(msgs);
                    baselineRef.current = msgs.map((m: MessageData) => m._id);
                    return true;
                }
            } catch (err) {
                console.error("Poll error:", err);
            }
        }
        return false;
    }, []);

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
    }, [pollForResponse]);

    return { mutateAsync, isPending, messages, loadMessages };
};