"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseAutoSaveProps<T> {
    data: T;
    onSave: (data: T) => Promise<void>;
    saveInterval?: number; // Defaults to 3 minutes (180000ms)
    localStorageKey?: string;
    enabled?: boolean;
}

export function useAutoSave<T>({
    data,
    onSave,
    saveInterval = 3 * 60 * 1000,
    localStorageKey,
    enabled = true,
}: UseAutoSaveProps<T>) {
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // ---- Stable refs so the interval callback never goes stale ----
    const dataRef = useRef<T>(data);
    const onSaveRef = useRef(onSave);
    const hasUnsavedRef = useRef(hasUnsavedChanges);
    const isSavingRef = useRef(isSaving);
    const enabledRef = useRef(enabled);
    const previousDataRef = useRef<T>(data);

    // Keep refs in sync
    useEffect(() => { dataRef.current = data; }, [data]);
    useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
    useEffect(() => { hasUnsavedRef.current = hasUnsavedChanges; }, [hasUnsavedChanges]);
    useEffect(() => { isSavingRef.current = isSaving; }, [isSaving]);
    useEffect(() => { enabledRef.current = enabled; }, [enabled]);

    // Deep comparison helper
    const hasChanged = useCallback((prev: T, current: T) => {
        return JSON.stringify(prev) !== JSON.stringify(current);
    }, []);

    // Detect data changes → mark dirty + write to localStorage
    useEffect(() => {
        if (enabled && hasChanged(previousDataRef.current, data)) {
            setHasUnsavedChanges(true);

            if (localStorageKey) {
                try {
                    localStorage.setItem(localStorageKey, JSON.stringify({
                        data,
                        timestamp: new Date().toISOString()
                    }));
                } catch (e) {
                    console.error("Failed to save to localStorage", e);
                }
            }
        }
    }, [data, enabled, hasChanged, localStorageKey]);

    // Core save logic (reads from refs, no deps that change frequently)
    const performSave = useCallback(async () => {
        if (!enabledRef.current || !hasUnsavedRef.current || isSavingRef.current) return;

        setIsSaving(true);
        try {
            await onSaveRef.current(dataRef.current);
            setLastSaved(new Date());
            setHasUnsavedChanges(false);
            previousDataRef.current = dataRef.current;
        } catch (error) {
            console.error("Auto-save failed", error);
        } finally {
            setIsSaving(false);
        }
    }, []); // Stable — never changes identity

    // ---- Interval timer (stable, never re-created) ----
    useEffect(() => {
        if (!enabled) return;

        const timer = setInterval(() => {
            if (hasUnsavedRef.current && !isSavingRef.current) {
                performSave();
            }
        }, saveInterval);

        return () => clearInterval(timer);
    }, [enabled, saveInterval, performSave]);

    // Load from local storage
    const loadFromLocalStorage = useCallback(() => {
        if (!localStorageKey) return null;
        try {
            const stored = localStorage.getItem(localStorageKey);
            if (stored) {
                const { data: storedData, timestamp } = JSON.parse(stored);
                return { data: storedData as T, timestamp: new Date(timestamp) };
            }
        } catch (e) {
            console.error("Failed to load from localStorage", e);
        }
        return null;
    }, [localStorageKey]);

    // Clear local storage
    const clearLocalStorage = useCallback(() => {
        if (localStorageKey) {
            localStorage.removeItem(localStorageKey);
        }
    }, [localStorageKey]);

    // Manual save: always saves (bypasses hasUnsavedChanges check), throws on error
    const manualSave = useCallback(async () => {
        if (isSavingRef.current) return;

        setIsSaving(true);
        try {
            await onSaveRef.current(dataRef.current);
            setLastSaved(new Date());
            setHasUnsavedChanges(false);
            previousDataRef.current = dataRef.current;
        } finally {
            setIsSaving(false);
        }
    }, []);

    // Warn before unload if unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedRef.current) {
                e.preventDefault();
                e.returnValue = "";
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, []);

    return {
        lastSaved,
        isSaving,
        hasUnsavedChanges,
        triggerSave: performSave,
        manualSave,
        loadFromLocalStorage,
        clearLocalStorage,
    };
}
