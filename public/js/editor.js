document.addEventListener('DOMContentLoaded', function() {
    // 存储当前编辑器内容
    let currentContent = '';
    let currentEditorType = 'markdown';
    let editorInstance = null;

    // 初始化编辑器
    function initEditor(type) {
        const editorArea = document.getElementById('editorArea');
        editorArea.innerHTML = '';
        
        switch(type) {
            case 'markdown':
                editorInstance = new SimpleMDE({
                    element: editorArea.appendChild(document.createElement('textarea')),
                    initialValue: currentContent,
                    spellChecker: false,
                    placeholder: "使用Markdown格式书写...",
                    toolbar: ["bold", "italic", "heading", "|", "quote", "unordered-list", "ordered-list", "|", "link", "image", "|", "preview", "guide"],
                    status: false
                });
                break;
                
            case 'richText':
                const quillContainer = document.createElement('div');
                editorArea.appendChild(quillContainer);
                editorInstance = new Quill(quillContainer, {
                    placeholder: "输入帖子内容...",
                    theme: 'snow',
                    modules: {
                        toolbar: [
                            [{ 'header': [1, 2, 3, false] }],
                            ['bold', 'italic', 'underline'],
                            [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                            ['link'],
                            ['clean']
                        ]
                    }
                });
                if (currentContent) {
                    editorInstance.root.innerHTML = currentContent;
                }
                break;
                
            case 'plain':
                const textarea = document.createElement('textarea');
                textarea.className = 'form-control';
                textarea.placeholder = "输入帖子内容...";
                textarea.style.minHeight = '300px';
                textarea.value = currentContent;
                editorArea.appendChild(textarea);
                editorInstance = textarea;
                break;
        }
    }

    // 切换编辑器类型
    function switchEditor(type) {
        // 保存当前编辑器内容
        if (editorInstance) {
            if (type === 'markdown' && editorInstance instanceof SimpleMDE) {
                currentContent = editorInstance.value();
            } else if (type === 'richText' && editorInstance instanceof Quill) {
                currentContent = editorInstance.root.innerHTML;
            } else if (editorInstance.tagName === 'TEXTAREA') {
                currentContent = editorInstance.value;
            }
        }
        
        currentEditorType = type;
        initEditor(type);
    }

    // 标签切换事件
    document.querySelectorAll('.editor-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            switchEditor(this.dataset.editor);
        });
    });

    // 表单提交处理
    document.querySelector('form').addEventListener('submit', function(e) {
        const contentInput = document.createElement('textarea');
        contentInput.name = 'content';
        contentInput.style.display = 'none';
        
        if (currentEditorType === 'markdown') {
            contentInput.value = editorInstance.value();
        } else if (currentEditorType === 'richText') {
            contentInput.value = editorInstance.root.innerHTML;
        } else {
            contentInput.value = editorInstance.value;
        }
        
        this.appendChild(contentInput);
    });

    // 初始化
    initEditor('markdown');
});
