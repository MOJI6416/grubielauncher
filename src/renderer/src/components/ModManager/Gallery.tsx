import { Image } from '@heroui/react'
import { IProject } from '@/types/ModManager'
import useEmblaCarousel from 'embla-carousel-react'
import { useCallback, useEffect, useState } from 'react'

export default function GalleryCarousel({ gallery }: { gallery: IProject['gallery'] }) {
  const [thumbEmblaRef] = useEmblaCarousel({ dragFree: true, containScroll: 'trimSnaps' })

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

  if (!gallery?.length) return null

  const openModal = (index: number) => {
    setSelectedIndex(index)
    setModalOpen(true)
  }

  return (
    <>
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
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true })
  const [current, setCurrent] = useState(startIndex)

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.scrollTo(startIndex, true)
    setCurrent(startIndex)
  }, [emblaApi, startIndex])

  useEffect(() => {
    if (!emblaApi) return

    const onSelect = () => {
      setCurrent(emblaApi.selectedScrollSnap())
    }

    emblaApi.on('select', onSelect)
    onSelect()

    return () => {
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi])

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') emblaApi?.scrollPrev()
      if (e.key === 'ArrowRight') emblaApi?.scrollNext()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [emblaApi, onClose])

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-3xl"
        aria-label="Close"
      >
        &times;
      </button>

      <div className="absolute top-4 left-4 text-white text-sm select-none">
        {' '}
        {current + 1}/{gallery.length}
      </div>

      <button
        onClick={scrollPrev}
        className="absolute left-6 text-white text-4xl select-none"
        aria-label="Previous"
      >
        &lt;
      </button>

      <button
        onClick={scrollNext}
        className="absolute right-6 text-white text-4xl select-none"
        aria-label="Next"
      >
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
