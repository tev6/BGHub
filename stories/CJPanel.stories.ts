import type { Meta, StoryObj } from '@storybook/vue3';
import CJPanel from './CJPanel.vue';

const meta: Meta<typeof CJPanel> = {
  title: 'Components/CJPanel',
  component: CJPanel,
  tags: ['autodocs'],
  argTypes: {
    boards: { control: 'object' }
  }
};

export default meta;
type Story = StoryObj<typeof CJPanel>;

const mockBoards = [
  {
    id: 1,
    slug: 'mathematics',
    name: '数学',
    description: 'AP 微积分、代数、统计与数学笔记',
    color: '#5b7cfa',
    sections: {
      IC: { content: '第一章：极限与连续性' },
      HW: { content: 'P.45 3-10题' },
      A: { content: '下周考试' }
    }
  },
  {
    id: 2,
    slug: 'physics',
    name: '物理',
    description: '实验、习题与考试提醒',
    color: '#06b6d4',
    sections: {
      IC: { content: '力学基础' },
      HW: { content: '实验报告' },
      A: { content: '' }
    }
  }
];

export const Default: Story = {
  args: {
    boards: mockBoards
  }
};

export const Empty: Story = {
  args: {
    boards: []
  }
};
