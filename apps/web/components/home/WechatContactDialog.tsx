"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WECHAT_ID, WECHAT_QR_IMAGE } from "@/lib/contact";

interface WechatContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WechatContactDialog({
  open,
  onOpenChange,
}: WechatContactDialogProps) {
  const [copied, setCopied] = useState(false);

  const copyWechatId = async () => {
    try {
      await navigator.clipboard.writeText(WECHAT_ID);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 shadow-xl">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-center text-2xl">添加微信好友</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6 flex flex-col items-center">
          <p className="text-sm text-gray-600 text-center mb-4">
            扫一扫下方二维码，或复制微信号添加我。
          </p>

          <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-gray-500">WeChatID</div>
              <div className="font-semibold text-gray-900 truncate">
                {WECHAT_ID}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyWechatId}
              aria-label="复制微信号"
            >
              {copied ? (
                <Check className="h-4 w-4 text-cyan-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="relative w-full max-w-[320px] rounded-lg overflow-hidden bg-white border border-gray-100">
            <Image
              src={WECHAT_QR_IMAGE}
              alt="微信好友二维码"
              width={888}
              height={1197}
              className="w-full h-auto object-contain"
              priority
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
