import type { Meta, StoryObj } from '@storybook/vue3';
import ChatCard from './ChatCard.vue';

const meta: Meta<typeof ChatCard> = {
  title: 'Components/ChatCard',
  component: ChatCard,
  tags: ['autodocs'],
  argTypes: {
    messages: { control: 'object' },
    user: { control: 'object' }
  }
};

export default meta;
type Story = StoryObj<typeof ChatCard>;

const mockMessages = [
  {
    id: 1,
    content: '大家好，请问有人知道下周数学考试的范围吗？',
    author_name: '张三',
    created_at: '2026-04-03T09:00:00Z'
  },
  {
    id: 2,
    content: '老师说是第一章到第三章，重点是积分计算。',
    author_name: '李四',
    created_at: '2026-04-03T09:15:00Z'
  }
];

export const LoggedIn: Story = {
  args: {
    messages: mockMessages,
    user: { id: 1, name: '当前用户' }
  }
};

export const LoggedOut: Story = {
  args: {
    messages: mockMessages,
    user: null
  }
};

export const Empty: Story = {
  args: {
    messages: [],
    user: { id: 1, name: '当前用户' }
  }
};
