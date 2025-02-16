import { expect } from 'chai';
import { buildRowTree } from './rowTreeUtils';

describe('buildRowTree', () => {
  it('should not expand the rows when defaultGroupingExpansionDepth === 0', () => {
    const response = buildRowTree({
      idRowsLookup: {
        0: {},
        1: {},
        2: {},
      },
      ids: [0, 1, 2],
      rows: [
        { id: 0, path: ['A'] },
        { id: 1, path: ['A', 'A'] },
        { id: 2, path: ['A', 'A', 'A'] },
      ],
      defaultGroupingExpansionDepth: 0,
    });

    expect(
      Object.values(response.tree).map((node) => ({
        id: node.id,
        childrenExpanded: node.childrenExpanded,
      })),
    ).to.deep.equal([
      { id: 0, childrenExpanded: false },
      { id: 1, childrenExpanded: false },
      { id: 2, childrenExpanded: false },
    ]);
  });

  it('should expand the rows up to defaultGroupingExpansionDepth', () => {
    const response = buildRowTree({
      idRowsLookup: {
        0: {},
        1: {},
        2: {},
      },
      ids: [0, 1, 2],
      rows: [
        { id: 0, path: ['A'] },
        { id: 1, path: ['A', 'A'] },
        { id: 2, path: ['A', 'A', 'A'] },
      ],
      defaultGroupingExpansionDepth: 2,
    });

    expect(
      Object.values(response.tree).map((node) => ({
        id: node.id,
        childrenExpanded: node.childrenExpanded,
      })),
    ).to.deep.equal([
      { id: 0, childrenExpanded: true },
      { id: 1, childrenExpanded: true },
      { id: 2, childrenExpanded: false },
    ]);
  });

  it('should expanded all the rows when defaultGroupingExpansionDepth === -1', () => {
    const response = buildRowTree({
      idRowsLookup: {
        0: {},
        1: {},
        2: {},
      },
      ids: [0, 1, 2],
      rows: [
        { id: 0, path: ['A'] },
        { id: 1, path: ['A', 'A'] },
        { id: 2, path: ['A', 'A', 'A'] },
      ],
      defaultGroupingExpansionDepth: -1,
    });

    expect(
      Object.values(response.tree).map((node) => ({
        id: node.id,
        childrenExpanded: node.childrenExpanded,
      })),
    ).to.deep.equal([
      { id: 0, childrenExpanded: true },
      { id: 1, childrenExpanded: true },
      { id: 2, childrenExpanded: true },
    ]);
  });

  it('should link parent and children in the tree', () => {
    const response = buildRowTree({
      idRowsLookup: {
        0: {},
        1: {},
        2: {},
        3: {},
      },
      ids: [0, 1, 2, 3],
      rows: [
        { id: 0, path: ['A'] },
        { id: 1, path: ['A', 'A'] },
        { id: 2, path: ['A', 'A', 'A'] },
        { id: 3, path: ['A', 'A', 'B'] },
      ],
      defaultGroupingExpansionDepth: 0,
    });

    expect(
      Object.values(response.tree).map((node) => ({
        id: node.id,
        parent: node.parent,
        children: node.children,
      })),
    ).to.deep.equal([
      { id: 0, parent: null, children: [1] },
      { id: 1, parent: 0, children: [2, 3] },
      { id: 2, parent: 1, children: undefined },
      { id: 3, parent: 1, children: undefined },
    ]);
  });

  it('should calculate the depth of the tree', () => {
    const response = buildRowTree({
      idRowsLookup: {
        0: {},
        1: {},
        2: {},
        3: {},
      },
      ids: [0, 1, 2, 3],
      rows: [
        { id: 0, path: ['A'] },
        { id: 1, path: ['A', 'A'] },
        { id: 2, path: ['A', 'A', 'A'] },
        { id: 3, path: ['A', 'A', 'B'] },
      ],
      defaultGroupingExpansionDepth: 0,
    });

    expect(response.treeDepth).to.equal(3);
  });

  it('should add auto generated row when missing parent', () => {
    const response = buildRowTree({
      idRowsLookup: {
        0: {},
        1: {},
      },
      ids: [0, 1],
      rows: [
        { id: 0, path: ['A'] },
        { id: 1, path: ['A', 'A', 'A'] },
      ],
      defaultGroupingExpansionDepth: 0,
    });

    expect(response).to.deep.equal({
      idRowsLookup: {
        0: {},
        1: {},
        'auto-generated-row-A-A': {},
      },
      ids: [0, 1, 'auto-generated-row-A-A'],
      treeDepth: 3,
      tree: {
        0: {
          children: ['auto-generated-row-A-A'],
          depth: 0,
          childrenExpanded: false,
          groupingValue: 'A',
          id: 0,
          parent: null,
        },
        'auto-generated-row-A-A': {
          children: [1],
          depth: 1,
          childrenExpanded: false,
          groupingValue: 'A',
          id: 'auto-generated-row-A-A',
          isAutoGenerated: true,
          parent: 0,
        },
        1: {
          children: undefined,
          depth: 2,
          childrenExpanded: false,
          groupingValue: 'A',
          id: 1,
          parent: 'auto-generated-row-A-A',
        },
      },
    });
  });
});
