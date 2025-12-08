import { Image } from '@heroui/react'
import { IProject } from '@/types/ModManager'
import useEmblaCarousel from 'embla-carousel-react'
import { useState, useEffect } from 'react'

export default function GalleryCarousel({ gallery }: { gallery: IProject['gallery'] }) {
  const [thumbEmblaRef] = useEmblaCarousel({ dragFree: true, containScroll: 'trimSnaps' })
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const openModal = (index: number) => {
    setSelectedIndex(index)
    setModalOpen(true)
  }

  return (
    <>
      {/* Thumbnail carousel */}
      <div className="overflow-hidden" ref={thumbEmblaRef}>
        <div className="flex gap-2 items-center">
          {gallery.map((image, idx) => (
            <div
              key={idx}
              className="min-w-[100px] max-w-[100px] cursor-pointer"
              onClick={() => openModal(idx)}
            >
              <Image src={image.url} className="object-cover mx-auto select-none" loading="lazy" />
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen modal with Embla */}
      {modalOpen && (
        <ModalGallery
          gallery={gallery}
          startIndex={selectedIndex}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

function ModalGallery({
  gallery,
  startIndex,
  onClose
}: {
  gallery: IProject['gallery']
  startIndex: number
  onClose: () => void
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel()

  useEffect(() => {
    if (emblaApi) {
      emblaApi.scrollTo(startIndex)
    }
  }, [emblaApi, startIndex])

  const scrollPrev = () => emblaApi && emblaApi.scrollPrev()
  const scrollNext = () => emblaApi && emblaApi.scrollNext()

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
      <button onClick={onClose} className="absolute top-4 right-4 text-white text-3xl">
        &times;
      </button>

      <button onClick={scrollPrev} className="absolute left-6 text-white text-4xl select-none">
        &lt;
      </button>

      <button onClick={scrollNext} className="absolute right-6 text-white text-4xl select-none">
        &gt;
      </button>

      <div className="w-full max-w-4xl overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {gallery.map((image, idx) => (
            <div key={idx} className="min-w-full flex justify-center">
              <Image
                src={image.url}
                alt=""
                className="max-h-[90vh] max-w-full object-contain mx-auto"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
