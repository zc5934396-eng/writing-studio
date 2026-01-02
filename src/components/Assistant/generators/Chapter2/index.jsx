import React from 'react';
import LiteratureWorkbench from './LiteratureWorkbench';

const Chapter2Generator = (props) => {
    // Props context dan onInsert diteruskan dari Orchestrator -> Wrapper -> Workbench
    return (
        <LiteratureWorkbench 
            context={props.context} 
            onInsert={props.onInsert} // Fungsi untuk insert teks ke Lexical Editor
        />
    );
};

export default Chapter2Generator;