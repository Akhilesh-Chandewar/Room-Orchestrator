"use client";

import { useState, useRef, useEffect } from "react";
import TextAreaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, Loader2Icon, CheckCircle2Icon, XCircleIcon, ClockIcon } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCreateMessages } from "@/hooks/useCreateMessages";
import { useRefresh } from "@/modules/home/context/RefreshContext";

interface Message {
    _id: string;
    role: "user" | "assistant";
    content: string;
    type?: "TEXT" | "ERROR" | "RESULT";
    createdAt: string;
}

const ChatPanel = () => {
    const [content, setContent] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { mutateAsync, isPending, messages, loadMessages } = useCreateMessages();
    const { triggerRefresh } = useRefresh();

    console.log("ChatPanel state:", { isPending, messagesCount: messages.length });

    useEffect(() => {
        loadMessages();
    }, [loadMessages]);

    useEffect(() => {
        setIsHydrated(true);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const isError = (msg: Message) => {
        return msg.type === "ERROR" || msg.content.startsWith("❌");
    };

    const isWaiting = (msg: Message) => {
        return msg.content.startsWith("⏳") || msg.content.includes("Taking longer");
    };

    const isBookingConfirmation = (content: string) => {
        return content.includes("✅") || 
               content.includes("Booked") ||
               content.includes("Confirmed");
    };

    const renderMessage = (msg: Message) => {
        if (isError(msg)) {
            return (
                <div className="flex items-start gap-2">
                    <XCircleIcon className="size-5 text-red-500 mt-0.5 shrink-0" />
                    <span className="text-red-600">{msg.content}</span>
                </div>
            );
        }

        if (isWaiting(msg)) {
            return (
                <div className="flex items-start gap-2">
                    <ClockIcon className="size-5 text-yellow-500 mt-0.5 shrink-0" />
                    <span className="text-yellow-600">{msg.content}</span>
                </div>
            );
        }

        if (isBookingConfirmation(msg.content)) {
            return (
                <div className="flex items-start gap-2">
                    <CheckCircle2Icon className="size-5 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-green-600 font-medium">{msg.content}</span>
                </div>
            );
        }

        return msg.content;
    };

    const onSubmit = async () => {
        if (!content.trim() || isPending) return;
        console.log("Submitting:", content);
        const currentContent = content;
        setContent("");

        try {
            await mutateAsync(currentContent);
            if (currentContent.toLowerCase().includes("book")) {
                setTimeout(() => triggerRefresh(), 1000);
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : "Failed to process request";
            toast.error(errorMsg);
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
                {!isHydrated ? (
                    <div className="text-center text-muted-foreground py-8">
                        <p className="text-sm">Loading...</p>
                    </div>
                ) : messages.length === 0 && !isPending ? (
                    <div className="text-center text-muted-foreground py-8">
                        <p className="text-sm">👋 Hi! I can help you book a meeting room.</p>
                        <p className="text-xs mt-2">Try: "Book room 101 at 2pm"</p>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg._id || msg.createdAt}
                            className={cn(
                                "flex",
                                msg.role === "user" ? "justify-end" : "justify-start"
                            )}
                        >
                            <div
                                className={cn(
                                    "max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap",
                                    msg.role === "user"
                                        ? "bg-primary text-primary-foreground"
                                        : isError(msg)
                                            ? "bg-red-50 border border-red-200"
                                            : "bg-muted"
                                )}
                            >
                                {renderMessage(msg)}
                            </div>
                        </div>
                    ))
                )}
                
                {isPending && (
                    <div className="flex justify-start">
                        <div className="bg-muted rounded-lg px-4 py-3 text-sm flex items-center gap-2">
                            <Loader2Icon className="size-4 animate-spin" />
                            <span className="text-muted-foreground">Processing...</span>
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} />
            </div>

            <div
                className={cn(
                    "relative border p-4 pt-1 rounded-xl bg-sidebar transition-all mx-4 mb-4",
                    isFocused && "shadow-xs"
                )}
            >
                <TextAreaAutosize
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={isPending}
                    placeholder="Book a room..."
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
                            <span>⌘</span>Enter
                        </kbd>
                        &nbsp;to send
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