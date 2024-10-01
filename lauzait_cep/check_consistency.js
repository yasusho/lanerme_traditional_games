const fs = require('fs');

const tsvs = [
    { file_name: '燐文.tsv', from: '日本語', to: '燐文' },
    { file_name: 'アイル語.tsv', from: '燐文', to: 'アイル語' },
  //  { file_name: 'タカン語.tsv', from: '日本語', to: 'タカン語' },
    { file_name: '燐→英.tsv', from: '燐文', to: '英語' },
 //   { file_name: 'pemecepe.tsv', from: '日本語', to: 'pemecepe' }
];

// Read all tsv files (headerless) and check that the columns of the same language are consistent

const joined_table = new Map();

function check_consistency_or_set(table, column, language, tsv_file_name) {
    if (table.has(language)) {
        const previous_column = table.get(language);
        if (previous_column.length !== column.length) {
            throw new Error(`The number of lines of ${tsv_file_name} (${column.length}) is different from the previous ones (${previous_column.length})`);
        }
        for (let i = 0; i < column.length; i++) {
            if (previous_column[i] !== column[i]) {
             /*   console.log(previous_column[i].length, column[i].length);
                console.log(
                    [...previous_column[i]].map(c => c.charCodeAt(0)),
                    [...column[i]].map(c => c.charCodeAt(0))
                );*/
                throw new Error(`The ${language} column of ${tsv_file_name} is different from the previous ones. Line ${i + 1}: "${previous_column[i]}" !== "${column[i]}"`);
            }
        }
    } else {
        table.set(language, column);
    }
}

tsvs.forEach(tsv => {
    const file = fs.readFileSync(tsv.file_name, 'utf-8');
    const lines = file.split(/\r?\n/);

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
