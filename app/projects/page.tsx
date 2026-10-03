import type { Metadata } from 'next';
import { ProjectHub } from '@/components/projects/project-hub';

export const metadata: Metadata = {
  title: 'My Projects | Codatron.ai AI Studio',
  description: 'Manage, create, and launch your persistent AI applications with unified Product Manager and Developer IDE.',
};

export default function ProjectsPage() {
  return <ProjectHub />;
}
