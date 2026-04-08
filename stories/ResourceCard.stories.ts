import type { Meta, StoryObj } from '@storybook/vue3';
import ResourceCard from './ResourceCard.vue';

const meta: Meta<typeof ResourceCard> = {
  title: 'Components/ResourceCard',
  component: ResourceCard,
  tags: ['autodocs'],
  argTypes: {
    resources: { control: 'object' },
    initialLimit: { control: 'number' }
  }
};

export default meta;
type Story = StoryObj<typeof ResourceCard>;

const mockResources = [
  {
    id: 1,
    title: 'AP 微积分复习笔记',
    description: '整理了公式与常见题型',
    board_name: '数学',
    download_count: 42,
    like_count: 15
  },
  {
    id: 2,
    title: '物理实验报告模板',
    description: '标准实验报告格式',
    board_name: '物理',
    download_count: 28,
    like_count: 8
  },
  {
    id: 3,
    title: '化学元素周期表',
    description: '高清元素周期表 PDF',
    board_name: '化学',
    download_count: 56,
    like_count: 22
  }
];

export const Default: Story = {
  args: {
    resources: mockResources,
    initialLimit: 3
  }
};

export const Empty: Story = {
  args: {
    resources: [],
    initialLimit: 3
  }
};
