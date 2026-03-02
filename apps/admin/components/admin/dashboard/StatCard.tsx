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
  gradient,
}: StatCardProps) {
  return (
    <div className="relative bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-300 overflow-hidden group">
      {/* 背景装饰 */}
      <div
        className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} opacity-5 rounded-full blur-2xl group-hover:opacity-10 transition-opacity`}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-4">
          <div
            className={`p-3 rounded-lg bg-gradient-to-br ${gradient} shadow-lg`}
          >
            <Icon className="h-6 w-6 text-white" />
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
          <p className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
