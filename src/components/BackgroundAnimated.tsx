import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Float, PerspectiveCamera, Environment, ContactShadows, MeshTransmissionMaterial } from '@react-three/drei';

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

/**
 * FluidBackground - Componente 3D per lo sfondo fluido animato
 * Utilizza uno shader custom per creare un effetto di rumore simplex
 */
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

/**
 * HeroGraphic - Componente 3D per la grafica hero con effetti di vetro/rifrazione
 * Include un icosaedro centrale con materiale di trasmissione, un anello orbitante
 * e sfere dati flottanti
 */
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
// Props per il componente BackgroundAnimated
// -----------------------------------------------------------------------------

export interface BackgroundAnimatedProps {
    /** Se true, mostra anche la grafica hero 3D (icosaedro, anello, sfere) */
    showHeroGraphic?: boolean;
    /** Classe CSS opzionale per il container */
    className?: string;
}

/**
 * BackgroundAnimated - Componente riutilizzabile per lo sfondo animato 3D
 * 
 * @example
 * // Solo sfondo fluido
 * <BackgroundAnimated />
 * 
 * @example
 * // Con grafica hero 3D
 * <BackgroundAnimated showHeroGraphic />
 */
export const BackgroundAnimated: React.FC<BackgroundAnimatedProps> = ({
    showHeroGraphic = false,
    className = ''
}) => {
    return (
        <div className={`fixed top-0 left-0 w-full h-full z-0 pointer-events-none opacity-100 transition-opacity duration-1000 ${className}`}>
            <Canvas>
                <PerspectiveCamera makeDefault position={[0, 0, 5]} />
                {/* Background Fluid */}
                <group position={[0, 0, -5]}>
                    <FluidBackground />
                </group>

                {/* 3D Hero Element - opzionale */}
                {showHeroGraphic && <HeroGraphic />}
            </Canvas>
        </div>
    );
};

export default BackgroundAnimated;
