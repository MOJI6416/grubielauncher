import { INews } from '@/types/News'
import { useEffect, useState } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { Button, Chip, Spinner } from '@heroui/react'
import { Eye, EyeClosed, Newspaper, RefreshCcw } from 'lucide-react'
import clsx from 'clsx'
import { useAtom } from 'jotai'
import { backendServiceAtom, networkAtom, onlineUsersAtom } from '@renderer/stores/Main'
import { useTranslation } from 'react-i18next'

const api = window.api
const shell = api.shell

export function NewsFeed() {
  const [isNetwork] = useAtom(networkAtom)
  const [news, setNews] = useState<INews[]>([])
  const [isVisible, setIsVisible] = useState(false)
  const [loadingType, setLoadingType] = useState<'init' | 'refresh' | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [backendService] = useAtom(backendServiceAtom)
  const [onlineUsers] = useAtom(onlineUsersAtom)

  const { t } = useTranslation()

  const [emblaRef] = useEmblaCarousel({ loop: false, dragFree: true }, [
    Autoplay({
      delay: 10000,
      stopOnInteraction: false,
      stopOnMouseEnter: true
    })
  ])

  async function fetchNews() {
    setIsLoading(true)

    const news = await backendService.getNews()

    setNews(news)
    setIsLoading(false)
    setLoadingType(null)
    setIsVisible(true)
  }

  useEffect(() => {
    if (!isNetwork) return

    setIsVisible(false)
    setLoadingType('init')
    fetchNews()
  }, [isNetwork])

  return (
    <>
      {isNetwork && (
        <div className="w-full shadow-inner">
          <div className="flex items-center justify-between w-full">
            <div
              className={clsx(
                'ml-4 flex items-center space-x-2',
                (!isVisible || !news.length) && 'mb-1'
              )}
            >
              <div className="flex items-center space-x-1.5">
                <Newspaper size={22} />
                <p className="font-semibold text-lg">{t('app.newsFeed')}</p>
              </div>

              {loadingType != 'init' && (
                <div className="flex items-center space-x-1">
                  <Button
                    size="sm"
                    isIconOnly
                    variant="flat"
                    isDisabled={isLoading}
                    onPress={() => setIsVisible(!isVisible)}
                  >
                    {!isVisible ? <Eye size={22} /> : <EyeClosed size={22} />}
                  </Button>
                  {isVisible && (
                    <Button
                      size="sm"
                      isIconOnly
                      variant="flat"
                      isLoading={loadingType == 'refresh'}
                      onPress={async () => {
                        setLoadingType('refresh')
                        await fetchNews()
                      }}
                    >
                      {<RefreshCcw size={22} />}
                    </Button>
                  )}
                </div>
              )}
              {loadingType == 'init' && <Spinner size="sm" />}
            </div>
            <div className="flex mr-4">
              <Chip variant="dot" color="success">
                {t('app.online', { count: onlineUsers })}
              </Chip>
            </div>
          </div>

          {isVisible && !!news.length && (
            <div className="max-w-screen-xl mx-auto px-4 py-2">
              <div className="overflow-hidden" ref={emblaRef}>
                <div className="flex gap-4">
                  {news.map((item, index) => (
                    <div
                      key={index}
                      className="relative h-[100px] flex-shrink-0 rounded-lg overflow-hidden shadow-lg cursor-pointer"
                      onClick={() => {
                        shell.openExternal(item.url)
                      }}
                    >
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover select-none"
                        loading="lazy"
                      />
                      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/70 to-transparent p-4">
                        <p className="text-gray-200 text-xs font-semibold select-none">
                          {item.title}
                        </p>
                      </div>
                    </div>
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
