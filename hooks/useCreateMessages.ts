import { useState } from "react";

type UseCreateMessagesReturn = {
    mutateAsync: (content: string) => Promise<unknown>;
    isPending: boolean;
};

export const useCreateMessages = (_projectId?: string): UseCreateMessagesReturn => {
    const [isPending, setIsPending] = useState(false);

    const mutateAsync = async (content: string) => {
        setIsPending(true);
        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: content,
                    roomId: `room-${Date.now()}`,
                }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || "Failed to send message");
            }

            return data;
        } finally {
            setIsPending(false);
        }
    };

    return { mutateAsync, isPending };
};
