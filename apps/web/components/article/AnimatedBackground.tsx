"use client";

/**
 * Animated background decorations for the article page.
 * Renders math, music, game, and tech-themed SVG/CSS animations
 * as a fixed overlay behind the content.
 */
export function AnimatedBackground() {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
            {/* === 数学元素 === */}

            {/* 斐波那契螺旋 */}
            <svg className="absolute top-1/4 left-10 w-64 h-64 opacity-[0.08] text-amber-500" viewBox="0 0 200 200" style={{ animation: 'slowSpin 40s linear infinite' }}>
                <path d="M 100 100 Q 100 80, 120 80 Q 140 80, 140 100 Q 140 120, 120 120 Q 100 120, 100 100" stroke="currentColor" strokeWidth="1.5" fill="none" />
                <path d="M 100 100 Q 100 60, 140 60 Q 180 60, 180 100 Q 180 140, 140 140 Q 100 140, 100 100" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6" />
                <circle cx="100" cy="100" r="2" fill="currentColor" />
                <circle cx="120" cy="80" r="1.5" fill="currentColor" />
                <circle cx="140" cy="100" r="1.5" fill="currentColor" />
            </svg>

            {/* 动态抛物线 */}
            <svg className="absolute bottom-1/3 right-1/4 w-72 h-48 opacity-[0.08] text-orange-500" viewBox="0 0 200 100">
                <path d="M 20 80 Q 60 10, 100 80 T 180 80" stroke="currentColor" strokeWidth="2" fill="none" className="animate-pulse" style={{ animationDuration: '4s' }} />
                <circle cx="20" cy="80" r="3" fill="currentColor">
                    <animate attributeName="cy" values="80;20;80" dur="4s" repeatCount="indefinite" />
                    <animate attributeName="cx" values="20;100;180" dur="4s" repeatCount="indefinite" />
                </circle>
            </svg>

            {/* 旋转的正多边形 */}
            <svg className="absolute top-1/3 right-1/3 w-32 h-32 opacity-[0.08] text-amber-600" viewBox="0 0 100 100" style={{ animation: 'slowSpin 20s linear infinite' }}>
                <polygon points="50,10 90,35 75,85 25,85 10,35" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <polygon points="50,25 75,40 65,70 35,70 25,40" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
                <circle cx="50" cy="50" r="3" fill="currentColor" />
            </svg>

            {/* 黄金分割矩形 */}
            <svg className="absolute bottom-1/4 left-1/4 w-40 h-40 opacity-[0.08] text-yellow-600" viewBox="0 0 100 100" style={{ animation: 'pulse 3s ease-in-out infinite' }}>
                <rect x="10" y="10" width="80" height="50" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect x="10" y="10" width="50" height="50" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7" />
                <line x1="60" y1="10" x2="10" y2="60" stroke="currentColor" strokeWidth="0.5" className="animate-pulse" />
            </svg>

            {/* 动态积分符号 */}
            <div className="absolute top-20 right-1/4 text-6xl opacity-10 text-amber-600" style={{ animation: 'floatUpDown 6s ease-in-out infinite' }}>
                ∫
            </div>

            {/* 无穷符号流动 */}
            <div className="absolute bottom-1/3 left-1/3 text-5xl opacity-10 text-orange-500" style={{ animation: 'rotate3d 8s ease-in-out infinite' }}>
                ∞
            </div>

            {/* === 音乐元素 === */}

            {/* 黑胶唱片旋转 */}
            <svg className="absolute top-1/2 left-20 w-32 h-32 opacity-[0.08] text-purple-600" viewBox="0 0 100 100" style={{ animation: 'recordSpin 3s linear infinite' }}>
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
                <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
                <circle cx="50" cy="50" r="25" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3" />
                <circle cx="50" cy="50" r="8" fill="currentColor" opacity="0.8" />
                <circle cx="50" cy="50" r="3" fill="none" stroke="white" strokeWidth="1" />
            </svg>

            {/* 动态频谱分析器 */}
            <div className="absolute bottom-1/4 right-20 flex items-end gap-2 opacity-10">
                {[12, 28, 20, 36, 16, 32, 24, 40, 18, 34, 22, 38, 20, 30, 26].map((height, i) => (
                    <div
                        key={i}
                        className="w-2 bg-gradient-to-t from-purple-500 to-pink-500 rounded-t-full"
                        style={{
                            height: `${height}px`,
                            animation: `spectrumBar ${0.6 + i * 0.1}s ease-in-out infinite`,
                            animationDelay: `${i * 0.05}s`
                        }}
                    />
                ))}
            </div>

            {/* 流动的音符 */}
            <div className="absolute top-40 left-1/3 opacity-10 text-purple-600 text-4xl" style={{ animation: 'musicFlow 8s ease-in-out infinite' }}>
                <span style={{ display: 'inline-block', animation: 'bounce 1s ease-in-out infinite' }}>♪</span>
                <span style={{ display: 'inline-block', animation: 'bounce 1s ease-in-out infinite', animationDelay: '0.2s' }}>♫</span>
                <span style={{ display: 'inline-block', animation: 'bounce 1s ease-in-out infinite', animationDelay: '0.4s' }}>♬</span>
            </div>

            {/* 钢琴键盘波动 */}
            <div className="absolute top-2/3 left-1/4 flex gap-0.5 opacity-[0.08]">
                {[0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0].map((isBlack, i) => (
                    <div
                        key={i}
                        className={`w-3 ${isBlack ? 'h-12 bg-purple-800' : 'h-20 bg-purple-400'} rounded-b`}
                        style={{
                            animation: 'pianoKey 2s ease-in-out infinite',
                            animationDelay: `${i * 0.1}s`
                        }}
                    />
                ))}
            </div>

            {/* 音波传播 */}
            <svg className="absolute bottom-1/2 right-1/3 w-48 h-48 opacity-[0.08] text-purple-500" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" strokeWidth="1">
                    <animate attributeName="r" values="10;40;10" dur="3s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0;1" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" strokeWidth="1">
                    <animate attributeName="r" values="10;40;10" dur="3s" begin="1s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0;1" dur="3s" begin="1s" repeatCount="indefinite" />
                </circle>
                <circle cx="50" cy="50" r="10" fill="none" stroke="currentColor" strokeWidth="1">
                    <animate attributeName="r" values="10;40;10" dur="3s" begin="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0;1" dur="3s" begin="2s" repeatCount="indefinite" />
                </circle>
            </svg>

            {/* === 游戏元素 === */}

            {/* 俄罗斯方块掉落 */}
            <div className="absolute top-10 right-40 opacity-10" style={{ animation: 'tetrisFall 5s linear infinite' }}>
                <svg width="40" height="40" viewBox="0 0 4 4" className="text-cyan-500">
                    <rect x="0" y="0" width="1" height="1" fill="currentColor" />
                    <rect x="1" y="0" width="1" height="1" fill="currentColor" />
                    <rect x="2" y="0" width="1" height="1" fill="currentColor" />
                    <rect x="1" y="1" width="1" height="1" fill="currentColor" />
                </svg>
            </div>

            {/* 吃豆人 */}
            <div className="absolute top-1/3 left-1/4 opacity-10" style={{ animation: 'pacmanMove 8s linear infinite' }}>
                <svg width="40" height="40" viewBox="0 0 100 100" className="text-yellow-500">
                    <circle cx="50" cy="50" r="40" fill="currentColor" />
                    <path d="M 50 50 L 80 30 A 40 40 0 0 1 80 70 Z" fill="#f3f4f6">
                        <animate attributeName="d" values="M 50 50 L 80 30 A 40 40 0 0 1 80 70 Z;M 50 50 L 90 50 A 40 40 0 0 1 90 50 Z;M 50 50 L 80 30 A 40 40 0 0 1 80 70 Z" dur="0.5s" repeatCount="indefinite" />
                    </path>
                </svg>
                <div className="flex gap-2 ml-12 mt-4">
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
            </div>

            {/* 技能冷却圆环 */}
            <svg className="absolute bottom-1/3 right-1/4 w-24 h-24 opacity-10 text-cyan-500" viewBox="0 0 100 100" style={{ animation: 'rotate 4s linear infinite' }}>
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="251" strokeDashoffset="0" transform="rotate(-90 50 50)">
                    <animate attributeName="stroke-dashoffset" values="251;0;251" dur="4s" repeatCount="indefinite" />
                </circle>
                <text x="50" y="55" textAnchor="middle" fill="currentColor" fontSize="20" fontWeight="bold">CD</text>
            </svg>

            {/* === 技术元素 === */}

            {/* 二进制矩阵雨 */}
            <div className="absolute top-0 left-1/2 opacity-[0.08] text-emerald-500 font-mono text-xs space-x-4 flex">
                {['1010', '0101', '1100', '0011', '1001'].map((binary, i) => (
                    <div key={i} style={{ animation: `matrixRain ${3 + i}s linear infinite`, animationDelay: `${i * 0.5}s` }}>
                        {binary.split('').map((bit, j) => (
                            <div key={j} className="opacity-80">{bit}</div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Git 分支图 */}
            <svg className="absolute bottom-40 left-12 w-40 h-40 opacity-[0.08] text-emerald-600" viewBox="0 0 100 100">
                <line x1="20" y1="90" x2="20" y2="10" stroke="currentColor" strokeWidth="2" />
                <line x1="20" y1="70" x2="50" y2="50" stroke="currentColor" strokeWidth="2" strokeDasharray="2,2" />
                <line x1="50" y1="50" x2="50" y2="10" stroke="currentColor" strokeWidth="2" />
                <line x1="50" y1="30" x2="80" y2="20" stroke="currentColor" strokeWidth="2" strokeDasharray="2,2" />
                <circle cx="20" cy="90" r="4" fill="currentColor" className="animate-pulse" />
                <circle cx="20" cy="70" r="4" fill="currentColor" className="animate-pulse" style={{ animationDelay: '0.5s' }} />
                <circle cx="50" cy="50" r="4" fill="currentColor" className="animate-pulse" style={{ animationDelay: '1s' }} />
                <circle cx="50" cy="30" r="4" fill="currentColor" className="animate-pulse" style={{ animationDelay: '1.5s' }} />
                <circle cx="80" cy="20" r="4" fill="currentColor" className="animate-pulse" style={{ animationDelay: '2s' }} />
            </svg>

            {/* 数据包传输 */}
            <svg className="absolute top-1/2 left-1/3 w-56 h-24 opacity-[0.08] text-teal-500" viewBox="0 0 200 50">
                <line x1="20" y1="25" x2="180" y2="25" stroke="currentColor" strokeWidth="2" />
                <circle cx="20" cy="25" r="6" fill="currentColor" />
                <circle cx="180" cy="25" r="6" fill="currentColor" />
                <rect x="0" y="15" width="20" height="20" fill="currentColor" opacity="0.8">
                    <animate attributeName="x" values="20;160;20" dur="3s" repeatCount="indefinite" />
                </rect>
                <text x="10" y="23" fill="white" fontSize="8" fontWeight="bold">
                    <animate attributeName="x" values="20;160;20" dur="3s" repeatCount="indefinite" />
                    DATA
                </text>
            </svg>

            {/* 代码编译进度 */}
            <div className="absolute bottom-1/4 right-1/3 opacity-10">
                <div className="text-emerald-600 font-mono text-xs mb-1">Compiling...</div>
                <div className="w-32 h-2 bg-gray-300/30 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ animation: 'compile 4s ease-in-out infinite' }} />
                </div>
            </div>

            {/* 神经网络节点 */}
            <svg className="absolute top-1/4 right-1/4 w-48 h-48 opacity-[0.08] text-teal-600" viewBox="0 0 100 100">
                <line x1="20" y1="20" x2="50" y2="50" stroke="currentColor" strokeWidth="0.5" className="animate-pulse" />
                <line x1="20" y1="80" x2="50" y2="50" stroke="currentColor" strokeWidth="0.5" className="animate-pulse" style={{ animationDelay: '0.3s' }} />
                <line x1="50" y1="50" x2="80" y2="30" stroke="currentColor" strokeWidth="0.5" className="animate-pulse" style={{ animationDelay: '0.6s' }} />
                <line x1="50" y1="50" x2="80" y2="70" stroke="currentColor" strokeWidth="0.5" className="animate-pulse" style={{ animationDelay: '0.9s' }} />
                <circle cx="20" cy="20" r="4" fill="currentColor" className="animate-pulse" />
                <circle cx="20" cy="80" r="4" fill="currentColor" className="animate-pulse" style={{ animationDelay: '0.2s' }} />
                <circle cx="50" cy="50" r="5" fill="currentColor" className="animate-pulse" style={{ animationDelay: '0.4s' }} />
                <circle cx="80" cy="30" r="4" fill="currentColor" className="animate-pulse" style={{ animationDelay: '0.6s' }} />
                <circle cx="80" cy="70" r="4" fill="currentColor" className="animate-pulse" style={{ animationDelay: '0.8s' }} />
            </svg>

            {/* 血条和经验值 */}
            <div className="absolute top-16 right-12 opacity-[0.12] space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-red-500 text-lg">❤</span>
                    <div className="w-24 h-3 bg-gray-300/30 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full" style={{ width: '75%', animation: 'healthPulse 2s ease-in-out infinite' }} />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-blue-500 text-lg">⚡</span>
                    <div className="w-24 h-3 bg-gray-300/30 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: '60%', animation: 'manaPulse 2.5s ease-in-out infinite' }} />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-yellow-500 text-lg">★</span>
                    <div className="w-24 h-3 bg-gray-300/30 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-yellow-500 to-amber-400 rounded-full" style={{ width: '45%', animation: 'expGrow 3s ease-in-out infinite' }} />
                    </div>
                </div>
            </div>

            {/* 服务器状态指示灯 */}
            <div className="absolute top-40 right-1/3 flex gap-2 opacity-[0.12]">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" style={{ animationDuration: '1s' }}></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse" style={{ animationDuration: '1.5s' }}></div>
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" style={{ animationDuration: '2s' }}></div>
            </div>

            {/* CPU/内存使用率 */}
            <div className="absolute bottom-16 left-1/2 opacity-10 text-teal-700 font-mono text-xs">
                <div className="flex gap-4">
                    <div>
                        <div>CPU: <span className="text-emerald-600" style={{ animation: 'textFlicker 2s ease-in-out infinite' }}>45%</span></div>
                    </div>
                    <div>
                        <div>RAM: <span className="text-cyan-600" style={{ animation: 'textFlicker 2.5s ease-in-out infinite' }}>68%</span></div>
                    </div>
                </div>
            </div>
        </div>
    );
}
