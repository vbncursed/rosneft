export interface Role {
  slug: string;
  title: string;
  isSystem: boolean;
  permissionSlugs: string[];
}
