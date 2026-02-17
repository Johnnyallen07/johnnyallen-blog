"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Github,
  Linkedin,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Navbar } from "@/components/home/Navbar";

/** B 站 logo 图标 */
function BilibiliIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" />
    </svg>
  );
}

/** 微信图标 */
function WechatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
  );
}

export function AboutPageClient() {
  const [wechatOpen, setWechatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-purple-50/20 to-cyan-50/20 relative overflow-hidden">
      {/* 创意动画背景 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* 旋转的几何图形 */}
        <div className="absolute top-20 right-20 w-32 h-32 border-4 border-cyan-400/10 rounded-lg animate-spin" style={{ animationDuration: "15s" }} />
        <div className="absolute bottom-32 left-32 w-24 h-24 border-4 border-purple-400/10 rounded-full animate-spin" style={{ animationDuration: "12s", animationDirection: "reverse" }} />
        <div className="absolute top-1/2 left-20 w-20 h-20 border-4 border-pink-400/10 rotate-45 animate-pulse" style={{ animationDuration: "4s" }} />

        {/* 音乐五线谱 */}
        <svg className="absolute top-40 left-1/4 w-64 h-32 opacity-5" viewBox="0 0 200 100">
          <line x1="0" y1="20" x2="200" y2="20" stroke="currentColor" strokeWidth="1" className="text-purple-600" />
          <line x1="0" y1="35" x2="200" y2="35" stroke="currentColor" strokeWidth="1" className="text-purple-600" />
          <line x1="0" y1="50" x2="200" y2="50" stroke="currentColor" strokeWidth="1" className="text-purple-600" />
          <line x1="0" y1="65" x2="200" y2="65" stroke="currentColor" strokeWidth="1" className="text-purple-600" />
          <line x1="0" y1="80" x2="200" y2="80" stroke="currentColor" strokeWidth="1" className="text-purple-600" />
          <circle cx="40" cy="50" r="8" fill="currentColor" className="text-purple-600 animate-pulse" style={{ animationDelay: "0s" }} />
          <circle cx="80" cy="35" r="8" fill="currentColor" className="text-purple-600 animate-pulse" style={{ animationDelay: "0.5s" }} />
          <circle cx="120" cy="65" r="8" fill="currentColor" className="text-purple-600 animate-pulse" style={{ animationDelay: "1s" }} />
          <circle cx="160" cy="50" r="8" fill="currentColor" className="text-purple-600 animate-pulse" style={{ animationDelay: "1.5s" }} />
        </svg>

        {/* 代码矩阵效果 */}
        <div className="absolute bottom-1/4 right-1/4 space-y-2 opacity-5 text-emerald-600">
          <div className="font-mono text-xs animate-pulse" style={{ animationDelay: "0s" }}>{`const passion = ['music', 'games', 'code'];`}</div>
          <div className="font-mono text-xs animate-pulse" style={{ animationDelay: "0.5s" }}>{`function createArt() {`}</div>
          <div className="font-mono text-xs animate-pulse ml-4" style={{ animationDelay: "1s" }}>{`return passion.map(p => express(p));`}</div>
          <div className="font-mono text-xs animate-pulse" style={{ animationDelay: "1.5s" }}>{`}`}</div>
        </div>

        {/* 漂浮粒子 */}
        <div className="absolute top-1/4 left-1/3 w-2 h-2 bg-cyan-400/30 rounded-full animate-bounce" style={{ animationDelay: "0s", animationDuration: "3s" }} />
        <div className="absolute top-1/3 right-1/3 w-3 h-3 bg-purple-400/30 rounded-full animate-bounce" style={{ animationDelay: "0.5s", animationDuration: "3.5s" }} />
        <div className="absolute bottom-1/3 left-1/2 w-2 h-2 bg-pink-400/30 rounded-full animate-bounce" style={{ animationDelay: "1s", animationDuration: "4s" }} />
        <div className="absolute top-2/3 right-1/4 w-3 h-3 bg-cyan-400/30 rounded-full animate-bounce" style={{ animationDelay: "1.5s", animationDuration: "3.2s" }} />

        {/* 柔和的模糊圆形背景 */}
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "0s", animationDuration: "7s" }} />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s", animationDuration: "8s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-400/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "4s", animationDuration: "9s" }} />

        {/* 渐变线条 */}
        <svg className="absolute top-1/2 right-10 w-48 h-48 opacity-10" viewBox="0 0 100 100">
          <path d="M 10 50 Q 30 20, 50 50 T 90 50" stroke="url(#about-gradient1)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDuration: "4s" }} />
          <path d="M 10 60 Q 30 90, 50 60 T 90 60" stroke="url(#about-gradient2)" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDelay: "1s", animationDuration: "4s" }} />
          <defs>
            <linearGradient id="about-gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id="about-gradient2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>

        {/* 音乐键盘 */}
        <svg className="absolute bottom-40 left-10 w-40 h-20 opacity-5" viewBox="0 0 100 30">
          <rect x="0" y="10" width="14" height="20" fill="white" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0s" }} />
          <rect x="14" y="10" width="14" height="20" fill="white" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.2s" }} />
          <rect x="28" y="10" width="14" height="20" fill="white" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.4s" }} />
          <rect x="42" y="10" width="14" height="20" fill="white" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.6s" }} />
          <rect x="56" y="10" width="14" height="20" fill="white" stroke="currentColor" strokeWidth="1" className="animate-pulse" style={{ animationDelay: "0.8s" }} />
          <rect x="10" y="10" width="8" height="12" fill="currentColor" className="animate-pulse" style={{ animationDelay: "0.1s" }} />
          <rect x="24" y="10" width="8" height="12" fill="currentColor" className="animate-pulse" style={{ animationDelay: "0.3s" }} />
          <rect x="48" y="10" width="8" height="12" fill="currentColor" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
        </svg>
      </div>

      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-12 relative z-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="w-32 h-32 mx-auto mb-6 rounded-full overflow-hidden border-4 border-white shadow-lg bg-gradient-to-br from-cyan-100 to-purple-100 flex items-center justify-center">
            <Image
              src="/images/avatar.png"
              alt="Johnny 头像"
              width={128}
              height={128}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Johnny</h1>
        </div>

        {/* 关于我 */}
        <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-8 mb-8 shadow-sm hover:bg-white/20 hover:border-cyan-300 transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">关于我</h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 leading-relaxed mb-4">
              帝国理工本科大三数学；在 Google 当了三个月的 prompt engineer，被 manager 一对一开会骂我在 commit 测试系统里面写 f**k；皮包国际教育机构老板；教微积分桃李满天下的老师但是不想教书；超级希望玩「缺氧」的 Steam 玩家。
            </p>
            <p className="text-gray-700 leading-relaxed">
              博客全是 AI 写的，除了这段文字。
            </p>
          </div>
        </div>

        {/* 联系方式 */}
        <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-8 shadow-sm hover:bg-white/20 hover:border-cyan-300 transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">联系我</h2>
          <p className="text-gray-700 mb-6">
            欢迎交流！
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="border-2 border-gray-300 bg-white/90 text-gray-800 shadow-sm hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 hover:shadow-md transition-all duration-200"
              asChild
            >
              <Link href="https://github.com/Johnnyallen07" target="_blank" rel="noopener noreferrer">
                <Github className="h-4 w-4 mr-2" />
                GitHub
              </Link>
            </Button>
            <Button
              variant="outline"
              className="border-2 border-gray-300 bg-white/90 text-gray-800 shadow-sm hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 hover:shadow-md transition-all duration-200"
              asChild
            >
              <Link href="mailto:johnnyallenyxc@gmail.com">
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Link>
            </Button>
            <Button
              variant="outline"
              className="border-2 border-gray-300 bg-white/90 text-gray-800 shadow-sm hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 hover:shadow-md transition-all duration-200"
              asChild
            >
              <Link href="https://www.linkedin.com/in/jieyu-zhao-88b264296/" target="_blank" rel="noopener noreferrer">
                <Linkedin className="h-4 w-4 mr-2" />
                LinkedIn
              </Link>
            </Button>
            <Button
              variant="outline"
              className="border-2 border-gray-300 bg-white/90 text-gray-800 shadow-sm hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 hover:shadow-md transition-all duration-200"
              asChild
            >
              <Link href="https://b23.tv/WwXUz18" target="_blank" rel="noopener noreferrer">
                <BilibiliIcon className="h-4 w-4 mr-2" />
                Bilibili
              </Link>
            </Button>
            <Button
              variant="outline"
              className="border-2 border-gray-300 bg-white/90 text-gray-800 shadow-sm hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-700 hover:shadow-md transition-all duration-200"
              onClick={() => setWechatOpen(true)}
            >
              <WechatIcon className="h-4 w-4 mr-2" />
              微信
            </Button>
          </div>
        </div>
      </div>

      {/* 微信二维码弹窗 */}
      <Dialog open={wechatOpen} onOpenChange={setWechatOpen}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden border-0 shadow-xl">
          <DialogHeader className="p-6 pb-2">
            <DialogTitle className="text-center">添加微信好友</DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 flex flex-col items-center">
            <p className="text-sm text-gray-600 text-center mb-4">
              扫一扫下方二维码，加我为朋友
            </p>
            <div className="relative rounded-lg overflow-hidden bg-white border border-gray-100">
              <Image
                src="/images/wechat-qr.png"
                alt="微信好友二维码"
                width={280}
                height={360}
                className="object-contain w-[280px] h-auto"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
