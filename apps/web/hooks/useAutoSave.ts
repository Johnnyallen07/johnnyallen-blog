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
    const previousDataRef = useRef<T>(data);

    // Deep comparison helper (simplified for this use case)
    const hasChanged = useCallback((prev: T, current: T) => {
        return JSON.stringify(prev) !== JSON.stringify(current);
    }, []);

    // Update hasUnsavedChanges when data changes
    useEffect(() => {
        if (enabled && hasChanged(previousDataRef.current, data)) {
            setHasUnsavedChanges(true);

            // Save to local storage immediately (debounced ideally, but direct for simplicity here)
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

    // Function to trigger save
    const triggerSave = useCallback(async () => {
        if (!enabled || !hasUnsavedChanges || isSaving) return;

        setIsSaving(true);
        try {
            await onSave(data);
            setLastSaved(new Date());
            setHasUnsavedChanges(false);
            previousDataRef.current = data;

            // Clear local storage after successful server save if desired? 
            // Actually keen it as backup until explicit exit might be safer, 
            // but standard behavior is usually to clear "draft" once persisted.
            // For now, we'll keep it as a crash recovery mechanism.
        } catch (error) {
            console.error("Auto-save failed", error);
            // Don't show toast on auto-save failure to avoid annoyance, 
            // or show a subtle one.
        } finally {
            setIsSaving(false);
        }
    }, [data, enabled, hasUnsavedChanges, isSaving, onSave]);

    // Interval timer
    useEffect(() => {
        if (!enabled) return;

        const timer = setInterval(() => {
            if (hasUnsavedChanges) {
                triggerSave();
            }
        }, saveInterval);

        return () => clearInterval(timer);
    }, [enabled, saveInterval, hasUnsavedChanges, triggerSave]);

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

    // Warn before unload if unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = "";
            }
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]);

    return {
        lastSaved,
        isSaving,
        hasUnsavedChanges,
        triggerSave,
        loadFromLocalStorage,
        clearLocalStorage,
    };
}
