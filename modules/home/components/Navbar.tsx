"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect } from "react";

export const Navbar = () => {
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <nav className={cn(
            "fixed top-0 left-0 right-0 z-50 transition-all duration-200 border-b backdrop-blur-md",
            isScrolled ? "bg-background/80 border-border" : "bg-transparent border-transparent"
        )}>
            <div className="max-w-5xl mx-auto w-full flex justify-center items-center h-14">
                <Link href={"/"} className="text-xl font-semibold absolute left-1/2 -translate-x-1/2">
                    Room Orchestrator
                </Link>
            </div>
        </nav>
    );
};