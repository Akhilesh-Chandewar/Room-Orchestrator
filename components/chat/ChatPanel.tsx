"use client";

import { useState, useRef, useEffect } from "react";
import TextAreaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCreateMessages } from "@/hooks/useCreateMessages";

interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
}

interface ChatPanelProps {
    projectId?: string;
}

const ChatPanel = ({ projectId }: ChatPanelProps) => {
    const [content, setContent] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { mutateAsync, isPending } = useCreateMessages(projectId);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const onSubmit = async () => {
        if (!content.trim() || isPending) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: content,
        };

        setMessages((prev) => [...prev, userMessage]);
        const currentContent = content;
        setContent("");

        try {
            const result = await mutateAsync(currentContent) as { message?: string };
            
            const assistantMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: result?.message || "I've processed your request.",
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : "Failed to process request";
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: errorMsg,
            };
            setMessages((prev) => [...prev, errorMessage]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto space-y-4 p-4">
                {messages.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                        <p className="text-sm">Chat with me to book a room</p>
                        <p className="text-xs mt-2">Try: "Book room 101 for tomorrow at 2pm for team standup"</p>
                    </div>
                )}
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={cn(
                            "flex",
                            msg.role === "user" ? "justify-end" : "justify-start"
                        )}
                    >
                        <div
                            className={cn(
                                "max-w-[80%] rounded-lg px-4 py-2 text-sm",
                                msg.role === "user"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
                            )}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div
                className={cn(
                    "relative border p-4 pt-1 rounded-xl bg-sidebar dark:bg-sidebar transition-all mx-4 mb-4",
                    isFocused && "shadow-xs"
                )}
            >
                <TextAreaAutosize
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={isPending}
                    placeholder="What would you like to build?"
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    minRows={2}
                    maxRows={4}
                    className={cn(
                        "pt-4 resize-none border-none w-full outline-none bg-transparent",
                        isPending && "opacity-50"
                    )}
                    onKeyDown={handleKeyDown}
                />

                <div className="flex gap-x-2 items-end justify-between pt-2">
                    <div className="text-[10px] text-muted-foreground font-mono">
                        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                            <span>&#8984;</span>Enter
                        </kbd>
                        &nbsp;to submit
                    </div>

                    <Button
                        type="button"
                        onClick={onSubmit}
                        disabled={isPending || !content.trim()}
                        className={cn(
                            "size-8 rounded-full",
                            isPending && "bg-muted-foreground border"
                        )}
                    >
                        {isPending ? (
                            <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                            <ArrowUpIcon className="size-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ChatPanel;