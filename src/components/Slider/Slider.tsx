import img1 from '../../assets/img1.webp'
import img2 from '../../assets/img2.webp'
import img3 from '../../assets/img3.webp'
import { cn } from '@/src/utils/utils'
import { useState } from 'react'

const Slider = () => {
    const [indexImg, setIndexImg] = useState(1)

    // Array di immagini per accedervi in modo dinamico
    const images = [img1, img2, img3]

    return (
        <div className="relative h-full overflow-hidden">
            {/* Immagine di sfondo in posizione assoluta */}
            <div
                className="absolute inset-0 bg-cover bg-center top-[48px] right-[48px] bottom-[48px] left-[48px] rounded-4xl"
                style={{
                    backgroundImage: `url(${images[indexImg - 1]})`,
                }}
            ></div>

            {/* Overlay sfocato nero */}
            <div className="absolute inset-0 top-[48px] right-[48px] bottom-[48px] left-[48px] bg-black/40 rounded-4xl"></div>

            {/* Contenuto dello slider sopra l'immagine */}
            <div className="relative z-10 flex flex-col justify-between items-center p-16 w-full h-full ">
                <h1 className="text-white font-bold text-5xl">LeTransfer</h1>
                <p className='flex flex-col gap-2 text-center text-white'>
                    <span className='font-normal text-2xl'>Trasferisci i tuoi dati</span>
                    <span className='font-normal text-2xl'>In totale sicurezza</span>
                </p>
                <div className='flex flex-col gap-4 whitespace-nowrap'>
                    <div className="flex flex-row gap-4">
                        <button
                            className={cn("w-10 h-1.5 bg-white text-black rounded-md", indexImg === 1 && "bg-[#724CF9]")}
                            onClick={() => setIndexImg(1)}
                        />
                        <button
                            className={cn("w-10 h-1.5 bg-white text-black rounded-md", indexImg === 2 && "bg-[#724CF9]")}
                            onClick={() => setIndexImg(2)}
                        />
                        <button
                            className={cn("w-10 h-1.5 bg-white text-black rounded-md", indexImg === 3 && "bg-[#724CF9]")}
                            onClick={() => setIndexImg(3)}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Slider