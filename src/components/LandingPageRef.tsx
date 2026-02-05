import React, { useRef, useLayoutEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useNavigate } from 'react-router';
import { Float, PerspectiveCamera, Environment, ContactShadows, MeshTransmissionMaterial } from '@react-three/drei';

gsap.registerPlugin(ScrollTrigger);

// -----------------------------------------------------------------------------
// SHADER BACKGROUND (HERO) - Kept subtle
// -----------------------------------------------------------------------------

const FluidShaderMaterial = {
    uniforms: {
        uTime: { value: 0 },
        uColor1: { value: new THREE.Color('#f4f3ef') },
        uColor2: { value: new THREE.Color('#e0e0e0') }, // Slightly more contrast
        uResolution: { value: new THREE.Vector2() }
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    varying vec2 vUv;

    // Simplex 2D noise
    vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }
    float snoise(vec2 v){
      const vec4 C = vec4(0.211324865405187, 0.366025403784439,
               -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod(i, 289.0);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
      + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      float noise = snoise(vUv * 2.5 + uTime * 0.05); // Slower, bigger noise
      float t = noise * 0.5 + 0.5;
      vec3 color = mix(uColor1, uColor2, t);
      float grain = (fract(sin(dot(vUv, vec2(12.9898,78.233)*2.0)) * 43758.5453) - 0.5) * 0.03;
      gl_FragColor = vec4(color + grain, 1.0);
    }
  `
};

function FluidBackground() {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (meshRef.current && meshRef.current.material) {
            // @ts-ignore
            meshRef.current.material.uniforms.uTime.value = state.clock.getElapsedTime();
        }
    });

    return (
        <mesh ref={meshRef} scale={[2, 2, 1]}>
            <planeGeometry args={[2, 2]} />
            <shaderMaterial attach="material" args={[FluidShaderMaterial]} />
        </mesh>
    );
}

// -----------------------------------------------------------------------------
// 3D HERO GRAPHIC (Glass/Abstract)
// -----------------------------------------------------------------------------

function HeroGraphic() {
    const group = useRef<THREE.Group>(null);

    useFrame((state) => {
        if (!group.current) return;
        const t = state.clock.getElapsedTime();
        // Gentle floating rotation
        group.current.rotation.x = Math.sin(t * 0.2) * 0.1;
        group.current.rotation.y = Math.sin(t * 0.3) * 0.15;
    });

    return (
        <group ref={group} position={[2, 0, 0]} rotation={[0, -0.5, 0]}>
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                {/* Central Core */}
                <mesh position={[0, 0, 0]}>
                    <icosahedronGeometry args={[1.5, 0]} />
                    <MeshTransmissionMaterial
                        roughness={0.1}
                        transmission={0.9}
                        thickness={1.5}
                        ior={1.5}
                        chromaticAberration={0.06}
                        color="#ffffff"
                        background={new THREE.Color('#f4f3ef')}
                    />
                </mesh>

                {/* Orbiting Ring */}
                <mesh rotation={[1.2, 0.5, 0]}>
                    <torusGeometry args={[2.2, 0.05, 16, 100]} />
                    <meshStandardMaterial color="#333" emissive="#000" />
                </mesh>

                {/* Floating Data Spheres */}
                <mesh position={[1.8, 1.2, 0.5]}>
                    <sphereGeometry args={[0.3, 32, 32]} />
                    <meshStandardMaterial color="#a855f7" roughness={0.2} metalness={0.8} />
                </mesh>
                <mesh position={[-1.6, -1.0, 0.8]}>
                    <sphereGeometry args={[0.2, 32, 32]} />
                    <meshStandardMaterial color="#3b82f6" roughness={0.2} metalness={0.8} />
                </mesh>
            </Float>
            <Environment preset="city" />
            <ContactShadows position={[0, -3.5, 0]} opacity={0.4} scale={10} blur={2.5} far={4} />
        </group>
    );
}


// -----------------------------------------------------------------------------
// SUB-COMPONENTS
// -----------------------------------------------------------------------------

const Section = ({ children, className = "", id = "" }: { children: React.ReactNode; className?: string, id?: string }) => (
    <section id={id} className={`min-h-screen flex flex-col justify-center px-8 md:px-24 md:py-12 relative z-10 w-full pointer-events-none ${className}`}>
        <div className="pointer-events-auto w-full max-w-7xl mx-auto">
            {children}
        </div>
    </section>
);

const FloatingWidget = ({ text, subtext, icon, className, speed = 1 }: { text: string, subtext?: string, icon?: string, className?: string, speed?: number }) => (
    <div className={`floating-widget absolute bg-white/60 backdrop-blur-xl border border-white/40 p-4 rounded-2xl shadow-xl flex items-center gap-4 w-64 z-0 ${className}`} data-speed={speed}>
        <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center text-xl">
            {icon || '📄'}
        </div>
        <div>
            <div className="font-bold text-sm text-gray-900">{text}</div>
            {subtext && <div className="text-xs text-gray-500">{subtext}</div>}
        </div>
    </div>
);

const RoadmapItem = ({ phase, title, result, features, color }: { phase: string, title: string, result: string, features: { category?: string, items: string[] }[], color: string }) => {
    return (
        <div className="roadmap-item relative pl-12 pb-24 border-l-2 border-white/20 last:border-0 ml-4 md:ml-0">
            {/* Dot */}
            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full ${color} shadow-[0_0_15px_rgba(255,255,255,0.5)]`}></div>

            <div className="space-y-4 opacity-0 transform translate-y-8 item-content">
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <span className={`inline-block px-3 py-1 rounded text-xs font-bold tracking-widest uppercase text-black bg-white/90 border border-white/20`}>
                        {phase}
                    </span>
                    <h3 className="text-3xl md:text-5xl font-bold text-white">{title}</h3>
                </div>

                <p className="text-xl text-gray-400 italic">"{result}"</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                    {features.map((section, idx) => (
                        <div key={idx} className="bg-white/5 p-6 rounded-xl border border-white/10 hover:border-white/30 transition-colors backdrop-blur-sm">
                            {section.category && <h4 className="text-sm font-mono text-gray-500 mb-4 uppercase tracking-wider">{section.category}</h4>}
                            <ul className="space-y-2">
                                {section.items.map((item, i) => (
                                    <li key={i} className="flex items-start gap-2 text-gray-300 font-light">
                                        <span className={`${color.replace('bg-', 'text-')} mt-1`}>▹</span> {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// -----------------------------------------------------------------------------
// HERO TRANSFER CARD (Option 1 - Interactive Stack)
// -----------------------------------------------------------------------------

const TRANSFER_DATA = [
    { name: "Project_Titan.zip", size: "2.4 GB", progress: 82, speed: "125 MB/s", time: "~08s", color: "from-blue-500 via-purple-500 to-pink-500" },
    { name: "Marketing_Assets_Q4.rar", size: "1.8 GB", progress: 45, speed: "98 MB/s", time: "~14s", color: "from-emerald-400 via-teal-500 to-cyan-500" },
    { name: "Client_Demo_Build.ipa", size: "450 MB", progress: 99, speed: "210 MB/s", time: "~01s", color: "from-orange-400 via-amber-500 to-yellow-500" },
];

const SingleTransferCard = ({ file, index, isNext = false }: { file: typeof TRANSFER_DATA[0], index: number, isNext?: boolean }) => (
    <div className={`w-full h-full bg-[#0f0f0f]/90 backdrop-blur-3xl border border-white/10 p-8 rounded-[2rem] shadow-2xl text-white select-none overflow-hidden ${isNext ? 'opacity-80' : ''}`}>
        {/* Top Glow Accent */}
        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${file.color} opacity-80`}></div>

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)] ${isNext ? '' : 'animate-pulse'}`}></div>
                <span className="text-xs font-mono text-gray-400 tracking-[0.2em] uppercase">Secure_Channel_0{index + 1}</span>
            </div>
            <div className="opacity-50">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
            </div>
        </div>

        {/* Content */}
        <div className="relative z-10">
            <div className="flex justify-between items-end mb-4">
                <h3 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60 truncate max-w-[200px]">
                    {file.name}
                </h3>
                <span className={`text-lg font-mono bg-gradient-to-l ${file.color} text-transparent bg-clip-text`}>
                    {file.progress}%
                </span>
            </div>

            {/* Progress Bar (Dynamic Width) */}
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mb-10 relative">
                <div
                    className={`absolute top-0 left-0 h-full bg-gradient-to-r ${file.color}`}
                    style={{ width: `${file.progress}%` }}
                >
                    {/* Shimmer Effect - Only for active card */}
                    {!isNext && <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>}
                    {!isNext && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full blur-[2px] shadow-[0_0_10px_white]"></div>}
                </div>
            </div>

            {/* Footer */}
            <div className="grid grid-cols-2 gap-8 border-t border-white/5 pt-6">
                <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Transfer Speed</div>
                    <div className="text-xl font-mono text-white/90">{file.speed}</div>
                </div>
                <div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Time Remaining</div>
                    <div className="text-xl font-mono text-white/90">{file.time}</div>
                </div>
            </div>
        </div>
    </div>
);

const HeroTransferCard = () => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);

    // Refs for the three visual layers
    const topCardRef = useRef<HTMLDivElement>(null);
    const midCardRef = useRef<HTMLDivElement>(null);
    const botCardRef = useRef<HTMLDivElement>(null);

    const currentFile = TRANSFER_DATA[currentIndex];
    const nextFile = TRANSFER_DATA[(currentIndex + 1) % TRANSFER_DATA.length];

    const handleCardClick = () => {
        if (isAnimating) return;
        setIsAnimating(true);

        const ctx = gsap.context(() => {
            const tl = gsap.timeline({
                onComplete: () => {
                    setCurrentIndex((prev) => (prev + 1) % TRANSFER_DATA.length);
                    setIsAnimating(false);
                    // Reset properties instantly for the "loop" effect
                    gsap.set([topCardRef.current, midCardRef.current, botCardRef.current], { clearProps: "all" });
                }
            });

            // 1. Top Card: Slide out and fade
            tl.to(topCardRef.current, {
                y: -60,
                scale: 0.9,
                opacity: 0,
                duration: 0.4,
                ease: "back.in(1.7)"
            }, 0);

            // 2. Mid Card: Move to Top position
            tl.to(midCardRef.current, {
                top: 0,
                scale: 1,
                opacity: 1, // Becomes fully opaque
                zIndex: 30, // Visual trick, though DOM order matters more for static z-index
                duration: 0.4,
                ease: "power2.out"
            }, 0.1);

            // 3. Bot Card: Move to Mid position
            tl.to(botCardRef.current, {
                top: "1rem", // 16px (top-4)
                scale: 0.95,
                duration: 0.4,
                ease: "power2.out"
            }, 0.1);

        }, topCardRef); // Scope to container (or top card for context)
    };

    return (
        <div className="relative group perspective-[1000px] cursor-pointer" onClick={handleCardClick}>

            {/* --- TOP LAYER (Active) --- */}
            <div ref={topCardRef} className="relative z-30 w-[380px] hover:-translate-y-1 transition-transform duration-500 ease-out">
                <SingleTransferCard key={currentFile.name} file={currentFile} index={currentIndex} />
            </div>

            {/* --- MIDDLE LAYER (Next) --- */}
            <div ref={midCardRef} className="absolute top-4 left-0 w-full h-full z-20 scale-[0.95] origin-bottom shadow-xl">
                <div className="w-full h-full relative">
                    {/* Dark overly to sim depth until focused */}
                    <div className="absolute inset-0 bg-black/40 z-10 rounded-[2rem] transition-opacity duration-300"></div>
                    <SingleTransferCard key={nextFile.name} file={nextFile} index={(currentIndex + 1) % TRANSFER_DATA.length} isNext />
                </div>
            </div>

            {/* --- BOTTOM LAYER (Decor) --- */}
            <div ref={botCardRef} className="absolute top-8 left-0 w-full h-full bg-[#0f0f0f]/40 backdrop-blur-sm border border-white/5 rounded-[2rem] z-10 scale-[0.9] origin-bottom"></div>
        </div>
    );
};


// -----------------------------------------------------------------------------
// MAIN COMPONENT
// -----------------------------------------------------------------------------

export const LandingPageRef = () => {
    const mouse = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const heroTextRef = useRef<HTMLDivElement>(null);
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();


    // Mouse movement handler
    const onMouseMove = (e: React.MouseEvent) => {
        mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    useLayoutEffect(() => {
        const ctx = gsap.context(() => {
            // 1. Hero Text Entry
            gsap.fromTo(heroTextRef.current?.children || [],
                { y: 100, opacity: 0 },
                { y: 0, opacity: 1, duration: 1.5, stagger: 0.1, ease: 'power4.out', delay: 0.2 }
            );



            // 3. Roadmap Items Animation
            const items = gsap.utils.toArray<HTMLElement>('.roadmap-item .item-content');
            items.forEach((item) => {
                gsap.to(item, {
                    y: 0,
                    opacity: 1,
                    duration: 1,
                    ease: 'power3.out',
                    scrollTrigger: {
                        trigger: item,
                        start: 'top 85%',
                        toggleActions: 'play none none reverse'
                    }
                });
            });

            // 4. Positioning Widgets Parallax
            gsap.to(".floating-widget", {
                y: (i, target) => -100 * target.dataset.speed,
                ease: "none",
                scrollTrigger: {
                    trigger: "#positioning-section",
                    start: "top bottom",
                    end: "bottom top",
                    scrub: 1
                }
            });

            // 5. Positioning Text Animation (Entrance)
            gsap.fromTo(".positioning-text-line",
                { y: 100, opacity: 0, rotateX: -20 },
                {
                    y: 0,
                    opacity: 1,
                    rotateX: 0,
                    duration: 1.2,
                    stagger: 0.1,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: "#positioning-section",
                        start: "top 75%",
                        toggleActions: "play none none reverse"
                    }
                }
            );



        }, containerRef);
        return () => ctx.revert();
    }, []);

    return (
        <div ref={containerRef} className="relative w-full min-h-screen overflow-x-hidden font-sans selection:bg-[#a0c0ff] selection:text-white bg-[#f4f3ef] text-[#1a1a1a] transition-colors duration-1000" onMouseMove={onMouseMove}>

            {/* 3D Background - Interactive */}
            <div ref={canvasContainerRef} className="fixed top-0 left-0 w-full h-full z-0 pointer-events-none opacity-100 transition-opacity duration-1000">
                <Canvas>
                    <PerspectiveCamera makeDefault position={[0, 0, 5]} />
                    {/* Background Fluid */}
                    <group position={[0, 0, -5]}>
                        <FluidBackground />
                    </group>

                    {/* 3D Hero Element (Only visible in first section technically, but we keep it) */}
                    <HeroGraphic />
                </Canvas>
            </div>

            {/* Navigation */}
            <nav className="fixed top-0 left-0 w-full p-6 flex justify-between items-center z-50 mix-blend-difference text-white">
                <div className="text-2xl font-bold tracking-tighter cursor-pointer pointer-events-auto" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                    leTransfer
                </div>
                <div className="flex gap-4 pointer-events-auto items-center">
                    <button
                        onClick={() => navigate('/login')}
                        className="px-6 py-2 bg-white text-black rounded-full font-semibold hover:scale-105 transition-transform duration-300 shadow-lg shadow-white/10"
                    >
                        Get Started
                    </button>
                </div>
            </nav>

            <div className="relative z-10 text-token-text-primary">

                {/* 1. HERO SECTION */}
                <Section className="h-screen flex items-center">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full h-full">
                        {/* LEFT: Text Content */}
                        <div ref={heroTextRef} className="flex flex-col justify-center items-center h-full z-10 pointer-events-none">
                            <div className="pointer-events-auto">
                                <span className="inline-block mb-6 px-4 py-1.5 rounded-full border border-black/10 bg-white/40 backdrop-blur-md text-sm font-medium uppercase tracking-wide">
                                    Next Gen File Sharing
                                </span>
                                <h1 className="text-[8rem] lg:text-[9rem] font-extrabold tracking-tighter leading-[0.9] mb-8 mix-blend-multiply text-gray-900">
                                    Seamless<br />
                                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600">Transfer.</span>
                                </h1>
                                <p className="text-2xl font-light text-gray-600 max-w-xl mb-10 leading-relaxed">
                                    La piattaforma definitiva per developer e creativi. Condividi file senza limiti, con il controllo che hai sempre desiderato.
                                </p>
                                <div className="flex gap-4">
                                    <button onClick={() => navigate('/login')} className="px-8 py-4 bg-black text-white text-lg rounded-full font-bold hover:bg-gray-800 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1">
                                        Start Transferring
                                    </button>
                                    <button onClick={() => document.getElementById('roadmap-section')?.scrollIntoView({ behavior: 'smooth' })} className="px-8 py-4 bg-white text-black border border-black/5 text-lg rounded-full font-bold hover:bg-gray-50 transition-all shadow-sm hover:shadow-md">
                                        View Roadmap
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: Live Transfer Card (Option 1) */}
                        <div className="hidden lg:flex items-center justify-center h-full perspective-[1000px]">
                            <HeroTransferCard />
                        </div>
                    </div>
                </Section>

                {/* 2. POSITIONING SECTION (Rich Context) */}
                <Section id="positioning-section" className="!md:min-h-[120vh] flex items-center justify-center relative overflow-hidden md:pb-64">

                    {/* Floating Context Widgets - Responsive Positioning */}
                    <FloatingWidget text="Project_Titan.zip" subtext="2.4 GB • Encrypted" icon="📦" className="hidden md:flex top-[21%] lg:top-[25%] left-[2%]" speed={1.2} />
                    <FloatingWidget text="Secure Link" subtext="Expires in 24h" icon="🔒" className="hidden md:flex top-[17%] right-[2%]" speed={0.8} />
                    <FloatingWidget text="Transfer Complete" subtext="120 MB/s" icon="⚡" className="hidden md:flex bottom-[10%] left-[5%]" speed={1.5} />
                    <FloatingWidget text="Team Access" subtext="Alice, Bob, You" icon="👥" className="hidden md:flex bottom-[15%] right-[5%]" speed={1.1} />


                    <div className="positioning-content relative w-full max-w-[90vw] -mt-10 md:-mt-20 z-10 text-center">
                        <h2 className="text-6xl font-black leading-tight tracking-tighter text-black break-words hyphens-auto">
                            <div className="overflow-hidden md:py-4 md:-my-4"><div className="positioning-text-line">Non un semplice file sharing,</div></div>
                            <div className="overflow-hidden py-4 -my-4"><div className="positioning-text-line">ma uno spazio per</div></div>
                            <div className="overflow-hidden py-4 -my-4">
                                <div className="positioning-text-line">
                                    <span className="italic font-serif bg-gradient-to-r from-purple-500 to-pink-500 text-transparent bg-clip-text pr-2">creare, collaborare e consegnare</span>
                                </div>
                            </div>
                            <div className="overflow-hidden py-4 -my-4">
                                <div className="positioning-text-line">
                                    con controllo.
                                </div>
                            </div>
                        </h2>
                        <p className="mt-8 md:mt-12 text-lg md:text-2xl text-gray-500 max-w-3xl mx-auto opacity-0 animate-fade-in-up px-4" style={{ animationDelay: '1s', animationFillMode: 'forwards' }}>
                            Dimentica i link scaduti e i file persi. leTransfer è il tuo hub digitale per gestire ogni aspetto della consegna.
                        </p>
                    </div>
                </Section>

                {/* 3. MVP FEATURE SECTION (Phase 0) - Dark Mode via CSS */}
                <Section id="mvp-section" className="bg-[#0a0a0a] text-white rounded-t-[4rem] -mt-12 py-32 relative z-20 shadow-[0_-20px_40px_rgba(0,0,0,0.2)]">
                    <div className="text-center max-w-4xl mx-auto mb-20">
                        <span className="inline-block px-4 py-1 rounded-full border border-white/20 text-xs font-bold uppercase tracking-widest mb-6 bg-white/10 backdrop-blur-md text-white">
                            Fase 0 — MVP
                        </span>
                        <h2 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight text-white">Validation.</h2>
                        <p className="text-xl opacity-60 text-gray-300">
                            “Posso condividere file pesanti in modo sicuro e controllato”
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-6xl mx-auto">
                        {/* Core & Upload */}
                        <div className="bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
                            <h3 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">🚀 Upload & Condivisione</h3>
                            <ul className="space-y-3 opacity-80 text-gray-300 grid grid-cols-2">
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Upload resumable</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Upload parallelo</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Drag & drop</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Background upload</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Supporto file grandi</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Creazione link</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Scadenza personalizzabile</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Revoca link</li>
                            </ul>
                        </div>

                        {/* Sharing & Security */}
                        <div className="bg-white/5 p-8 rounded-3xl border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
                            <h3 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">🛡️ Sicurezza & Features</h3>
                            <ul className="space-y-3 opacity-80 text-gray-300 grid grid-cols-2">
                                <li className="flex gap-3"><span className="text-green-400">✓</span> End-to-end encryption</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Password sui link (gratis)</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Preview immagini</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Preview video</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Preview PDF</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Tracking download</li>
                                <li className="flex gap-3"><span className="text-green-400">✓</span> Notifica download</li>
                            </ul>
                        </div>
                    </div>
                </Section>

                {/* 4. ROADMAP TIMELINE (Phase 1+) - Continue Dark Mode */}
                <Section id="roadmap-section" className="bg-[#0a0a0a] text-white pb-32 pt-0 z-20 relative -mt-1">
                    <div className="max-w-5xl mx-auto relative">
                        <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gray-600 to-gray-400 mb-24 opacity-60">
                            THE ROADMAP
                        </h2>

                        {/* Vertical Line */}
                        <div className="absolute left-[23px] md:left-[19px] top-40 bottom-0 w-[2px] bg-gradient-to-b from-blue-500 via-purple-500 to-transparent opacity-30 ml-4 md:ml-0"></div>

                        <div className="space-y-24">
                            {/* FASE 1 */}
                            <RoadmapItem
                                phase="Fase 1 — v1"
                                title="Power Tools"
                                result="Non è solo invio file, è uno strumento di lavoro."
                                color="bg-purple-500"
                                features={[
                                    { category: 'Security & Control', items: ['Scadenza per numero download', 'Autodistruzione post-download'] },
                                    { category: 'Creativi', items: ['Commenti su file', 'Commenti su timestamp (AV)', 'Versioning file'] },
                                    { category: 'Dev / Tech', items: ['API upload/download', 'Checksum file'] }
                                ]}
                            />

                            {/* FASE 1.5 */}
                            <RoadmapItem
                                phase="Fase 1.5 — v1.5"
                                title="Tailored Workflows"
                                result="È fatto apposta per il mio lavoro"
                                color="bg-pink-500"
                                features={[
                                    { category: 'Creativi Avanzate', items: ['Preview audio con waveform', 'Annotazioni visive', 'Stato file (review/approved)', 'Watermark dinamici'] },
                                    { category: 'Dev / Tech Avanzate', items: ['Webhooks', 'Token temporanei', 'Versioning avanzato', 'Link monouso'] }
                                ]}
                            />

                            {/* FASE 2 */}
                            <RoadmapItem
                                phase="Fase 2 — v2"
                                title="The Delivery Hub"
                                result="È il mio hub di consegna file"
                                color="bg-amber-500"
                                features={[
                                    { category: 'Sicurezza Avanzata', items: ['Link limitati per IP/Paese', 'Accesso via email specifica'] },
                                    { category: 'Dev Power', items: ['CLI Tool', 'Integrazione CI/CD', 'Diff tra versioni'] },
                                    { category: 'Collaborazione', items: ['Chat collegata al file', 'Mention', 'Commenti threaded'] }
                                ]}
                            />

                            {/* FASE 3 */}
                            <RoadmapItem
                                phase="Fase 3 — Future"
                                title="Enterprise Intelligence"
                                result="Strumento professionale completo"
                                color="bg-green-500"
                                features={[
                                    { category: 'AI & Scale', items: ['AI preview assistant', 'AI file summary', 'Firma digitale', 'Audit avanzato', 'Workspace team'] }
                                ]}
                            />
                        </div>
                    </div>
                </Section>

                {/* 5. FOOTER (Agency Style) */}
                <footer className="relative w-full bg-black text-white pt-32 pb-12 px-6 md:px-24 mt-24 z-20 overflow-hidden">
                    <div className="max-w-7xl mx-auto relative z-10">
                        {/* Top: CTA */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-24 gap-12">
                            <div>
                                <h3 className="text-6xl md:text-8xl font-bold tracking-tighter mb-8 max-w-2xl">
                                    Ready to move<br />
                                    <span className="text-gray-500">mountains?</span>
                                </h3>
                                <button
                                    onClick={() => navigate('/login')}
                                    className="group flex items-center gap-4 text-2xl font-medium hover:gap-6 transition-all duration-300"
                                >
                                    <span className="border-b border-white pb-1 group-hover:border-transparent transition-colors">Start Transferring</span>
                                    <span className="bg-white text-black rounded-full p-3 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="7" y1="17" x2="17" y2="7"></line>
                                            <polyline points="7 7 17 7 17 17"></polyline>
                                        </svg>
                                    </span>
                                </button>
                            </div>
                            <div className="flex flex-col w-full md:w-auto items-start text-left sm:items-end sm:text-right">
                                <p className="text-gray-400 max-w-xs text-lg mb-8">
                                    Join thousands of developers and creatives who trust leTransfer for their daily workflow.
                                </p>
                                <div className="h-px w-full bg-white/20 mb-8"></div>
                                <p className="text-sm font-mono text-gray-500">EST. 2025 — ROME, IT</p>
                            </div>
                        </div>

                        {/* Middle & Bottom: Links & Info under Separator */}
                        <div className="md:border-t md:border-white/10 md:pt-16 mb-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-12 sm:text-right">
                                <div className="col-span-1">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Platform</h4>
                                    <ul className="space-y-4">
                                        {['Features', 'Security', 'Pricing', 'Roadmap', 'API'].map((item) => (
                                            <li key={item}>
                                                <a href="#" className="text-lg hover:text-blue-400 transition-colors block -translate-x-0 hover:translate-x-2 duration-300 ease-out">{item}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="col-span-1">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Company</h4>
                                    <ul className="space-y-4">
                                        {['About', 'Careers', 'Brand', 'Contact'].map((item) => (
                                            <li key={item}>
                                                <a href="#" className="text-lg hover:text-blue-400 transition-colors block -translate-x-0 hover:translate-x-2 duration-300 ease-out">{item}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="col-span-1">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Socials</h4>
                                    <ul className="space-y-4">
                                        {['Instagram', 'LinkedIn', 'Twitter', 'GitHub'].map((item) => (
                                            <li key={item}>
                                                <a href="#" className="text-lg hover:text-blue-400 transition-colors block -translate-x-0 hover:translate-x-2 duration-300 ease-out">{item}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="col-span-1">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-6">Legal & Help</h4>
                                    <ul className="space-y-4">
                                        {['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Help Center'].map((item) => (
                                            <li key={item}>
                                                <a href="#" className="text-lg hover:text-blue-400 transition-colors block -translate-x-0 hover:translate-x-2 duration-300 ease-out">{item}</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Massive Background Title */}
                        <div className="relative w-full overflow-hidden pointer-events-none select-none opacity-20 mt-2">
                            <h1 className="text-[calc((100vw-3rem)/6)] md:text-[calc((100vw-12rem)/6)] xl:text-[13rem] font-black text-transparent opacity-100 bg-clip-text bg-gradient-to-r from-gray-600 to-gray-400 tracking-tighter text-left leading-none whitespace-nowrap">
                                LETRANSFER
                            </h1>
                        </div>
                    </div>
                </footer>

            </div>

            <style>{`
                 @keyframes fadeInUp {
                     from { opacity: 0; transform: translateY(20px); }
                     to { opacity: 1; transform: translateY(0); }
                 }
                 .animate-fade-in-up {
                     animation: fadeInUp 0.8s ease-out forwards;
                 }
             `}</style>
        </div>
    );
};

export default LandingPageRef;
