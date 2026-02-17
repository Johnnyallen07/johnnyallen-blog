"use client";

import { useState } from "react";

interface ImageWithFallbackProps {
    src: string;
    alt: string;
    className?: string;
}

export function ImageWithFallback({ src, alt, className }: ImageWithFallbackProps) {
    const [error, setError] = useState(false);

    if (error) {
        return (
            <div
                className={`flex items-center justify-center bg-gradient-to-br from-purple-100 to-pink-100 text-purple-400 ${className}`}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                </svg>
            </div>
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            className={className}
            onError={() => setError(true)}
        />
    );
}
