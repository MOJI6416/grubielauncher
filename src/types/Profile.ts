import { IModpackCard } from "./Backend";
import { ICatalogSkin } from "./SkinManager";

export interface IPublicProfileSocials {
  discord?: { id: string; username: string | null } | null;
}

export interface IPublicProfile {
  generatedAt: string;
  id: string;
  nickname: string;
  headUrl: string;
  image: string;
  isDonor: boolean;
  donorSince: string | null;
  createdAt: string | null;
  playTimeHours: number;
  points: number;
  level: number;
  achievements: string[];
  rank: number | null;
  socials: IPublicProfileSocials;
  modpacks: IModpackCard[];
  skins: ICatalogSkin[];
}
