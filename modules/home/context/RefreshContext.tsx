"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type RefreshFn = () => void;

const RefreshContext = createContext<{
    triggerRefresh: RefreshFn;
    registerRefresh: (fn: RefreshFn) => void;
} | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
    const [refreshFn, setRefreshFn] = useState<RefreshFn | null>(null);

    const triggerRefresh = useCallback(() => {
        console.log("triggerRefresh called, has fn:", !!refreshFn);
        if (refreshFn) {
            refreshFn();
        } else {
            console.log("No refresh function registered!");
        }
    }, [refreshFn]);

    const registerRefresh = useCallback((fn: RefreshFn) => {
        console.log("registerRefresh called");
        setRefreshFn(() => fn);
    }, []);

    return (
        <RefreshContext.Provider value={{ triggerRefresh, registerRefresh }}>
            {children}
        </RefreshContext.Provider>
    );
}

export function useRefresh() {
    const context = useContext(RefreshContext);
    if (!context) throw new Error("useRefresh must be used within RefreshProvider");
    return context;
}