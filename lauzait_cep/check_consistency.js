const fs = require('fs');

const tsvs = [
    { file_name: 'アイル語.tsv', from: '燐文', to: 'アイル語' },
    { file_name: 'タカン語.tsv', from: '日本語', to: 'タカン語' },
    { file_name: '燐→英.tsv', from: '燐文', to: '英語' },
    { file_name: '燐文.tsv', from: '日本語', to: '燐文' },
    { file_name: 'pemecepe.tsv', from: '日本語', to: 'pemecepe' }
];

// Read all tsv files (headerless) and check that the columns of the same language are consistent

const joined_table = new Map();

function check_consistency_or_set(table, column, language, tsv_file_name) {
    if (table.has(language)) {
        const previous_column = table.get(language);
        if (previous_column.length !== column.length) {
            console.error(`The number of lines of ${tsv_file_name} (${column.length}) is different from the previous ones (${previous_column.length})`);
            process.exit(1);
        }
        for (let i = 0; i < column.length; i++) {
            if (previous_column[i] !== column[i]) {
                console.error(`The ${language} column of ${tsv_file_name} is different from the previous ones. 
                    Line ${i + 1}: ${previous_column[i]} !== ${column[i]}`);
                process.exit(1);
            }
        }
    } else {
        table.set(language, column);
    }
}

tsvs.forEach(tsv => {
    const lines = fs.readFileSync(tsv.file_name, 'utf-8').split('\n');
    if (lines[lines.length - 1] === '') {
        lines.pop();
    }
    const lines_separated = lines.map(line => line.split('\t'));
    const first_column = lines_separated.map(line => line[0]);
    const second_column = lines_separated.map(line => line[1]);

    check_consistency_or_set(joined_table, first_column, tsv.from, tsv.file_name);
    check_consistency_or_set(joined_table, second_column, tsv.to, tsv.file_name);
});

console.log('All columns are consistent');
