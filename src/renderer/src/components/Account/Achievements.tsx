import { IUser } from '@/types/IUser'
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Progress,
  ScrollShadow
} from '@heroui/react'
import { useTranslation } from 'react-i18next'
import pt100 from '@renderer/assets/achievements/pt100.png'
import pt500 from '@renderer/assets/achievements/pt500.png'
import pt1000 from '@renderer/assets/achievements/pt1000.png'
import clsx from 'clsx'
import { Check, X } from 'lucide-react'
import { useMemo } from 'react'

type AchievementType = 'playtime'

type Achievement = {
  id: string
  type: AchievementType
  points: number
  icon: string
}

const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: 'pt100', type: 'playtime', points: 100, icon: pt100 },
  { id: 'pt500', type: 'playtime', points: 500, icon: pt500 },
  { id: 'pt1000', type: 'playtime', points: 1000, icon: pt1000 }
]

export function Achievements({ onClose, user }: { onClose: () => void; user: IUser }) {
  const { t } = useTranslation()

  const achievedSet = useMemo(() => new Set(user.achievements), [user.achievements])

  const playtimeHours = useMemo(() => {
    const seconds = typeof user.playTime === 'number' ? user.playTime : 0
    return seconds / 3600
  }, [user.playTime])

  return (
    <Modal isOpen onClose={onClose}>
      <ModalContent>
        <ModalHeader>{t('achievements.title')}</ModalHeader>

        <ModalBody>
          <ScrollShadow className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
            {ALL_ACHIEVEMENTS.map((achievement) => {
              const achieved = achievedSet.has(achievement.id)

              const progressValue = achievement.type === 'playtime' ? playtimeHours : 0

              return (
                <div key={achievement.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      width={64}
                      height={64}
                      draggable={false}
                      src={achievement.icon}
                      alt={t(`achievements.${achievement.id}`)}
                    />

                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-sm truncate">
                        {t(`achievements.${achievement.id}`)}
                      </span>

                      {!achieved && (
                        <Progress value={progressValue} maxValue={achievement.points} size="sm" />
                      )}
                    </div>
                  </div>

                  <span className={clsx(achieved ? 'text-green-500' : 'text-red-500')}>
                    {achieved ? <Check size={22} /> : <X size={22} />}
                  </span>
                </div>
              )
            })}
          </ScrollShadow>
        </ModalBody>

        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            {t('common.close')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
