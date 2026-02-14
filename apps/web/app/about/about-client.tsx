"use client";

import {
  Github,
  Twitter,
  Mail,
  Rss,
  Music,
  Gamepad2,
  Code,
  Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/home/Navbar";

export function AboutPageClient() {
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

      {/* 导航栏 */}
      <Navbar />

      {/* 主要内容 */}
      <div className="max-w-4xl mx-auto px-6 py-12 relative z-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-cyan-100 to-purple-100 flex items-center justify-center border-4 border-white shadow-lg">
            <span className="text-6xl">👨‍💻</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Johnny</h1>
          <p className="text-xl text-gray-600">
            游戏玩家 · 音乐爱好者 · 技术探索者
          </p>
        </div>

        {/* 关于我 */}
        <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-8 mb-8 shadow-sm hover:bg-white/20 hover:border-cyan-300 transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">关于我</h2>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700 leading-relaxed mb-4">
              你好！我是
              Johnny，一个热爱游戏、音乐和技术的创作者。我相信技术可以让生活更美好，音乐能让灵魂更丰富，而游戏则是探索无限可能的最好方式。
            </p>

            <p className="text-gray-700 leading-relaxed mb-4">
              从小学习小提琴和钢琴，音乐给了我对美的独特理解。在大学学习计算机科学后，我发现编程和作曲有着惊人的相似之处——都是在创造某种和谐的结构。
            </p>

            <p className="text-gray-700 leading-relaxed">
              这个博客是我分享游戏攻略、音乐心得和技术笔记的地方。希望我的文字能对你有所帮助或启发。
            </p>
          </div>
        </div>

        {/* 技能 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-6 shadow-sm hover:bg-white/20 hover:border-cyan-300 transition-all duration-300">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-100 to-blue-100 flex items-center justify-center mb-4">
              <Gamepad2 className="h-6 w-6 text-cyan-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">游戏</h3>
            <p className="text-sm text-gray-600">
              策略游戏爱好者，特别喜欢《缺氧》《文明》等需要规划和思考的游戏
            </p>
          </div>

          <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-6 shadow-sm hover:bg-white/20 hover:border-purple-300 transition-all duration-300">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center mb-4">
              <Music className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">音乐</h3>
            <p className="text-sm text-gray-600">
              拉小提琴10年，弹钢琴8年。热爱古典音乐，也喜欢爵士和电子音乐
            </p>
          </div>

          <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-6 shadow-sm hover:bg-white/20 hover:border-emerald-300 transition-all duration-300">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center mb-4">
              <Code className="h-6 w-6 text-emerald-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">技术</h3>
            <p className="text-sm text-gray-600">
              全栈开发者，专注于 Web 技术。喜欢研究新技术和优化用户体验
            </p>
          </div>
        </div>

        {/* 音乐作品 */}
        <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-8 mb-8 shadow-sm hover:bg-white/20 hover:border-purple-300 transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Music className="h-6 w-6 text-purple-600" />
            我的音乐
          </h2>

          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">🎻 小提琴</h3>
              <p className="text-gray-600 text-sm mb-2">最喜欢的作品：</p>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• Meditation from Thaïs (Massenet)</li>
                <li>• Csárdás (Monti)</li>
                <li>
                  • Violin Concerto in D major, Op. 35 (Tchaikovsky)
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-white/30">
              <h3 className="font-semibold text-gray-900 mb-2">🎹 钢琴</h3>
              <p className="text-gray-600 text-sm mb-2">最喜欢的作品：</p>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• Nocturne Op.9 No.2 (Chopin)</li>
                <li>• Clair de Lune (Debussy)</li>
                <li>• Für Elise (Beethoven)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 成就 */}
        <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-8 mb-8 shadow-sm hover:bg-white/20 hover:border-amber-300 transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Award className="h-6 w-6 text-amber-500" />
            里程碑
          </h2>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-500 mt-2" />
              <div>
                <p className="font-medium text-gray-900">
                  2025 - 博客创建
                </p>
                <p className="text-sm text-gray-600">
                  开始记录我的游戏、音乐和技术之旅
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2" />
              <div>
                <p className="font-medium text-gray-900">
                  2023 - 音乐演出
                </p>
                <p className="text-sm text-gray-600">
                  参加了首次公开的室内乐演出
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2" />
              <div>
                <p className="font-medium text-gray-900">
                  2022 - 全栈开发
                </p>
                <p className="text-sm text-gray-600">
                  成为全栈开发者，开始独立项目
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 联系方式 */}
        <div className="bg-transparent backdrop-blur-sm border border-white/40 rounded-xl p-8 shadow-sm hover:bg-white/20 hover:border-cyan-300 transition-all duration-300">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">联系我</h2>
          <p className="text-gray-700 mb-6">
            欢迎与我交流游戏、音乐或技术相关的话题！
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="border-white/60 bg-white/30 hover:bg-white/50"
            >
              <Github className="h-4 w-4 mr-2" />
              GitHub
            </Button>
            <Button
              variant="outline"
              className="border-white/60 bg-white/30 hover:bg-white/50"
            >
              <Twitter className="h-4 w-4 mr-2" />
              Twitter
            </Button>
            <Button
              variant="outline"
              className="border-white/60 bg-white/30 hover:bg-white/50"
            >
              <Mail className="h-4 w-4 mr-2" />
              Email
            </Button>
            <Button
              variant="outline"
              className="border-white/60 bg-white/30 hover:bg-white/50"
            >
              <Rss className="h-4 w-4 mr-2" />
              RSS 订阅
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
