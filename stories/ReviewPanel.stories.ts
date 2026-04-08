import type { Meta, StoryObj } from '@storybook/vue3';
import ReviewPanel from './ReviewPanel.vue';

const meta: Meta<typeof ReviewPanel> = {
  title: 'Components/ReviewPanel',
  component: ReviewPanel,
  tags: ['autodocs'],
  argTypes: {
    initialItems: { control: 'object' },
    userLevel: { control: 'number' },
    totalItems: { control: 'number' }
  }
};

export default meta;
type Story = StoryObj<typeof ReviewPanel>;

const mockItems = [
  {
    id: 1,
    item_type: 'post',
    item_id: 101,
    payload: 'AP 微积分链式法则怎么理解？',
    status: 'pending',
    author_name: '张三',
    created_at: '2026-04-03T10:30:00Z'
  },
  {
    id: 2,
    item_type: 'chat',
    item_id: 201,
    payload: '有人知道物理老师办公室在哪吗？',
    status: 'pending',
    author_name: '李四',
    created_at: '2026-04-03T11:00:00Z'
  },
  {
    id: 3,
    item_type: 'resource',
    item_id: 301,
    payload: '化学实验安全手册',
    status: 'pending',
    author_name: '王五',
    created_at: '2026-04-03T09:45:00Z'
  }
];

export const Default: Story = {
  args: {
    initialItems: mockItems,
    userLevel: 3,
    initialPage: 1,
    totalItems: 3,
    totalPages: 1
  }
};

export const Empty: Story = {
  args: {
    initialItems: [],
    userLevel: 3,
    initialPage: 1,
    totalItems: 0,
    totalPages: 1
  }
};

export const WithPagination: Story = {
  args: {
    initialItems: mockItems,
    userLevel: 4,
    initialPage: 2,
    totalItems: 45,
    totalPages: 3
  }
};
