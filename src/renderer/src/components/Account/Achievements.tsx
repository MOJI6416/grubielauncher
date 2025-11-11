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

const ALL_ACHIEVEMENTS = [
  {
    id: 'pt100',
    type: 'playtime',
    points: 100
  },
  {
    id: 'pt500',
    type: 'playtime',
    points: 500
  },
  {
    id: 'pt1000',
    type: 'playtime',
    points: 1000
  }
]

export function Achievements({ onClose, user }: { onClose: () => void; user: IUser }) {
  const { t } = useTranslation()

  return (
    <Modal isOpen onClose={onClose}>
      <ModalContent>
        <ModalHeader>{t('achievements.title')}</ModalHeader>
        <ModalBody>
          <ScrollShadow className="flex flex-col space-y-2 max-h-96 overflow-y-auto pr-1">
            {ALL_ACHIEVEMENTS.map((achievement) => {
              const achieved = user.achievements.includes(achievement.id)

              return (
                <div key={achievement.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <img
                      width={48}
                      draggable={false}
                      src={
                        achievement.id == 'pt100'
                          ? pt100
                          : achievement.id == 'pt500'
                            ? pt500
                            : achievement.id == 'pt1000'
                              ? pt1000
                              : ''
                      }
                      alt={t(`achievements.${achievement.id}`)}
                      className={clsx(!achieved && 'filter grayscale')}
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-sm">{t(`achievements.${achievement.id}`)}</span>
                      {!achieved && (
                        <Progress
                          value={achievement.type == 'playtime' ? user.playTime / 3600 : 0}
                          maxValue={parseInt(achievement.points.toString())}
                          size="sm"
                        />
                      )}
                    </div>
                  </div>

                  <span className={clsx(achieved ? 'text-green-500' : 'text-red-500')}>
                    {achieved ? <Check /> : <X />}
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
