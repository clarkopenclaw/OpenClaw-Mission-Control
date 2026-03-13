import TaskBoard from './TaskBoard';

export default function ProjectBoard({ slug }: { slug: string }) {
  return <TaskBoard projectSlug={slug} />;
}
