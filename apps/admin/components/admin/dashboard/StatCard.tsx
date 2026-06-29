"use client";

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "increase" | "decrease";
  icon: LucideIcon;
  gradient: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType,
  icon: Icon,
}: StatCardProps) {
  return (
    <div className="relative bg-white border border-gray-200 rounded-xl p-6 transition-all duration-300 overflow-hidden group">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div className="p-3 rounded-lg bg-amber-100">
            <Icon className="h-6 w-6 text-amber-600" />
          </div>
          {change && (
            <div
              className={`flex items-center gap-1 text-sm font-medium ${
                changeType === "increase" ? "text-green-600" : "text-red-600"
              }`}
            >
              {changeType === "increase" ? "↑" : "↓"} {change}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
