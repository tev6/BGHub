import type { Meta, StoryObj } from '@storybook/vue3';
import ArticleList from './ArticleList.vue';

const meta: Meta<typeof ArticleList> = {
  title: 'Components/ArticleList',
  component: ArticleList,
  tags: ['autodocs'],
  argTypes: {
    posts: { control: 'object' }
  }
};

export default meta;
type Story = StoryObj<typeof ArticleList>;

const mockPosts = [
  {
    id: 1,
    title: 'AP 微积分链式法则怎么理解？',
    content: '我想整理一份链式法则的直观理解和例题，请大家补充。',
    board_name: '数学',
    author_name: '张三',
    comment_count: 5,
    view_count: 128,
    is_anonymous: false,
    created_at: '2026-04-03T10:30:00Z'
  },
  {
    id: 2,
    title: '物理力学笔记分享',
    content: '![image](https://example.com/physics.png) 这是我整理的力学笔记...',
    board_name: '物理',
    author_name: '李四',
    comment_count: 12,
    view_count: 256,
    is_anonymous: true,
    created_at: '2026-04-02T15:20:00Z'
  }
];

export const Default: Story = {
  args: {
    posts: mockPosts
  }
};

export const Empty: Story = {
  args: {
    posts: []
  }
};
