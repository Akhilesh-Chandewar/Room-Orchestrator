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

function parseBookingRequest(message: string) {
    const text = message.toLowerCase();
    
    const roomMatch = text.match(/room\s*(\d+)/i);
    const roomNumber = roomMatch ? roomMatch[1] : null;
    
    const slotMatch = text.match(/slot\s*(\d+)/i);
    const slot = slotMatch ? parseInt(slotMatch[1]) : 1;
    
    const titleMatch = text.match(/for\s+(.+?)(?:\s+for|\s+at|$)/i);
    const title = titleMatch ? titleMatch[1].trim() : "Meeting";
    
    const nameMatch = text.match(/(?:book\s+(?:room\s+\d+\s+)?(?:slot\s+\d+\s+)?for\s+)([^,\s]+)/i);
    const bookedBy = nameMatch ? nameMatch[1].trim() : "Guest";
    
    if (roomNumber) {
        return { roomNumber, slot, title, bookedBy };
    }
    return null;
}

export const useCreateMessages = (): UseCreateMessagesReturn => {
    const [isPending, setIsPending] = useState(false);
    const [messages, setMessages] = useState<MessageData[]>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("chat_messages");
            return saved ? JSON.parse(saved) : [];
        }
        return [];
    });
    const baselineRef = useRef<string[]>([]);

    const saveToStorage = useCallback((msgs: MessageData[]) => {
        if (typeof window !== "undefined") {
            localStorage.setItem("chat_messages", JSON.stringify(msgs));
        }
    }, []);

    const loadMessages = useCallback(async () => {
        try {
            const response = await fetch("/api/messages", {
                method: "GET",
            });
            if (response.ok) {
                const data = await response.json();
                const msgs: MessageData[] = data.messages || [];
                setMessages(msgs);
                saveToStorage(msgs);
                baselineRef.current = msgs.map((m: MessageData) => m._id);
            }
        } catch (error) {
            console.error("Failed to load messages:", error);
        }
    }, [saveToStorage]);

    const pollForResponse = useCallback(async () => {
        for (let i = 0; i < 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
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
        setMessages(prev => {
            const newMsgs = [...prev, userMsg];
            saveToStorage(newMsgs);
            return newMsgs;
        });

        try {
            const bookingInfo = parseBookingRequest(content);
            
            if (bookingInfo) {
                const response = await fetch("/api/book", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(bookingInfo),
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || "Failed to book");
                }
                
                setMessages(prev => {
                    const newMsgs = [...prev, {
                        _id: `booked-${Date.now()}`,
                        role: "assistant" as const,
                        content: `✅ Booked Room ${bookingInfo.roomNumber} for ${bookingInfo.bookedBy}\n📅 Slot ${bookingInfo.slot}\n📋 ${bookingInfo.title}`,
                        createdAt: new Date().toISOString(),
                    }];
                    saveToStorage(newMsgs);
                    return newMsgs;
                });
            } else {
                const chatResponse = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ message: content }),
                });

                const chatData = await chatResponse.json();

                if (!chatResponse.ok || !chatData.success) {
                    throw new Error(chatData.error || "Failed to send message");
                }

                const hasResponse = await pollForResponse();
                
                if (!hasResponse) {
                    setMessages(prev => {
                        const newMsgs = [...prev, {
                            _id: `timeout-${Date.now()}`,
                            role: "assistant" as const,
                            content: "No response received",
                            type: "TEXT" as const,
                            createdAt: new Date().toISOString(),
                        }];
                        saveToStorage(newMsgs);
                        return newMsgs;
                    });
                } else {
                    const response = await fetch("/api/messages");
                    const data = await response.json();
                    const msgs: MessageData[] = data.messages || [];
                    setMessages(msgs);
                    saveToStorage(msgs);
                }
            }
            
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : "Failed to process request";
            
            setMessages(prev => {
                const newMsgs = [...prev, {
                    _id: `error-${Date.now()}`,
                    role: "assistant" as const,
                    content: errorMsg,
                    type: "ERROR" as const,
                    createdAt: new Date().toISOString(),
                }];
                saveToStorage(newMsgs);
                return newMsgs;
            });
        } finally {
            setIsPending(false);
        }
    }, [pollForResponse, saveToStorage]);

    return { mutateAsync, isPending, messages, loadMessages };
};