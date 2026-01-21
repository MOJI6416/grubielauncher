import { INews } from '@/types/News'
import { useCallback, useEffect, useRef, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { Button, Chip, Skeleton } from '@heroui/react'
import { Eye, EyeClosed, Newspaper, RefreshCcw } from 'lucide-react'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { networkAtom, onlineUsersAtom } from '@renderer/stores/atoms'
import { useTranslation } from 'react-i18next'

const api = window.api

export function NewsFeed() {
  const [isNetwork] = useAtom(networkAtom)
  const [news, setNews] = useState<INews[]>([])
  const [isVisible, setIsVisible] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [onlineUsers] = useAtom(onlineUsersAtom)

  const { t } = useTranslation()

  const autoplayRef = useRef(
    Autoplay({
      delay: 10000,
      stopOnInteraction: false,
      stopOnMouseEnter: true
    })
  )

  const [emblaRef] = useEmblaCarousel({ loop: false, dragFree: true }, [autoplayRef.current])

  const reqIdRef = useRef(0)

  const fetchNews = useCallback(async () => {
    const reqId = ++reqIdRef.current
    setIsLoading(true)

    try {
      const result: INews[] = await api.backend.getNews()
      if (reqIdRef.current !== reqId) return
      setNews(Array.isArray(result) ? result : [])
    } catch {
      if (reqIdRef.current !== reqId) return
      setNews([])
    } finally {
      if (reqIdRef.current === reqId) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isNetwork) {
      setIsLoading(false)
      setNews([])
      return
    }

    fetchNews()
  }, [isNetwork, fetchNews])

  return (
    <>
      {isNetwork && (
        <div className="w-full shadow-inner">
          <div className="flex items-center justify-between w-full">
            <div className={clsx('ml-4 flex items-center space-x-2', !isVisible && 'mb-2.5')}>
              <div className="flex items-center space-x-1.5">
                <Newspaper size={22} />
                <p className="font-semibold text-lg">{t('app.newsFeed')}</p>
              </div>

              <div className="flex items-center space-x-1">
                <Button
                  size="sm"
                  isIconOnly
                  variant="flat"
                  isDisabled={isLoading}
                  onPress={() => setIsVisible((v) => !v)}
                >
                  {!isVisible ? <Eye size={22} /> : <EyeClosed size={22} />}
                </Button>

                {isVisible && (
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    isLoading={isLoading}
                    isDisabled={isLoading}
                    onPress={fetchNews}
                  >
                    <RefreshCcw size={22} />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex mr-4">
              <Chip variant="dot" color="success">
                {t('app.online', { count: onlineUsers })}
              </Chip>
            </div>
          </div>

          {isVisible && (
            <div className="max-w-screen-xl mx-auto px-4 py-2">
              <div className="overflow-hidden" ref={emblaRef}>
                <div className="flex gap-4">
                  {news.length > 0
                    ? news.map((item) => (
                        <div
                          key={item.url}
                          className="relative h-[100px] flex-shrink-0 rounded-lg overflow-hidden shadow-lg cursor-pointer"
                          onClick={async () => {
                            try {
                              await api.shell.openExternal(item.url)
                            } catch {}
                          }}
                        >
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover select-none"
                            loading="lazy"
                            draggable={false}
                          />
                          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/70 to-transparent p-4">
                            <p className="text-gray-200 text-xs font-semibold select-none">
                              {item.title}
                            </p>
                          </div>
                        </div>
                      ))
                    : [1, 2, 3, 4, 5].map((n) => (
                        <Skeleton key={n} className="h-[100px] w-[300px] rounded-lg shadow-lg">
                          <div className="w-full h-full" />
                        </Skeleton>
                      ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
